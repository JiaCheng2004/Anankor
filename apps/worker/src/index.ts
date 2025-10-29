import { Client, GatewayIntentBits } from 'discord.js';
import { loadWorkerConfig } from '@anankor/config';
import { createLogger } from '@anankor/logger';
import { bootstrapTelemetry } from '@anankor/telemetry';
import {
  acknowledgeJob,
  buildWorkerJobStreamKey,
  claimWorkerToken,
  createRedisClient,
  decodeJobEntry,
  ensureJobConsumerGroup,
  readJobStream,
  JOB_STREAM_KEY,
  registerWorkerInPool,
  refreshWorkerPresence,
  unregisterWorkerFromPool,
} from '@anankor/ipc';
import type { GuildCommandJobBase, JobEnvelope, PingRespondJob } from '@anankor/schemas';
import type { TextBasedChannel, TextChannel } from 'discord.js';
import { MusicPlaybackService } from './services/music.js';

const JOB_CONSUMER_GROUP = 'anankor-workers';
const JOB_BLOCK_MS = 5000;
const JOB_BATCH_SIZE = 5;

type GuildCommandJob = Exclude<JobEnvelope, PingRespondJob>;

async function main() {
  const config = loadWorkerConfig();
  const telemetry = await bootstrapTelemetry({
    serviceName: 'anankor-worker',
    serviceNamespace: 'apps',
  });
  const logger = createLogger({ name: 'worker' });

  logger.info({ claimed: false }, 'Worker starting up');

  const redis = createRedisClient(config.redisUrl);
  const claim = await claimWorkerToken(redis, config.workerTokens);
  await ensureJobConsumerGroup(redis, JOB_CONSUMER_GROUP);

  const workerStreamKey = buildWorkerJobStreamKey(claim.workerId);
  await ensureJobConsumerGroup(redis, JOB_CONSUMER_GROUP, workerStreamKey);
  await registerWorkerInPool(redis, claim.workerId);

  const presenceInterval = setInterval(() => {
    void refreshWorkerPresence(redis, claim.workerId).catch((error: unknown) => {
      logger.warn({ err: error, workerId: claim.workerId }, 'Failed to refresh worker presence heartbeat');
    });
  }, 10000);
  presenceInterval.unref?.();

  logger.info({ workerId: claim.workerId }, 'Worker claimed token');

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates],
  });

  const musicService = new MusicPlaybackService(client, config, logger);

  client.once('ready', async (readyClient) => {
    logger.info(
      { workerId: claim.workerId, user: readyClient.user.tag },
      'Worker bot connected to Discord gateway',
    );
    try {
      await musicService.onClientReady();
      logger.info({ workerId: claim.workerId }, 'Music playback service initialised');
    } catch (error) {
      logger.error({ err: error, workerId: claim.workerId }, 'Failed to initialise music playback service');
    }
  });

  client.on('error', (err) => {
    logger.error({ err, workerId: claim.workerId }, 'Worker Discord client error');
  });

  const jobLoopController = new AbortController();
  const services: WorkerServices = {
    music: musicService,
  };

  const processJobs = async () => {
    while (!jobLoopController.signal.aborted) {
      try {
        const entries = await readJobStream(redis, JOB_CONSUMER_GROUP, claim.workerId, {
          blockMs: JOB_BLOCK_MS,
          count: JOB_BATCH_SIZE,
        }, [JOB_STREAM_KEY, workerStreamKey]);

    if (entries.length === 0) {
      continue;
    }

        for (const entry of entries) {
          try {
            const job = decodeJobEntry(entry);
            await handleJob(client, job, claim.workerId, logger, services);
            await acknowledgeJob(redis, JOB_CONSUMER_GROUP, entry);
          } catch (error) {
            logger.error({ err: error, workerId: claim.workerId, entryId: entry.id }, 'Failed processing job entry');
            try {
              await acknowledgeJob(redis, JOB_CONSUMER_GROUP, entry);
            } catch (ackError) {
              logger.error(
                { err: ackError, workerId: claim.workerId, entryId: entry.id },
                'Failed to acknowledge job after error',
              );
            }
          }
        }
      } catch (error) {
        if (jobLoopController.signal.aborted) {
          break;
        }
        logger.error({ err: error, workerId: claim.workerId }, 'Job polling loop failure');
      }
    }
  };

  await client.login(claim.token);
  const jobLoopPromise = processJobs();

  const keepAlive = setInterval(() => undefined, 1 << 30);

  const shutdown = async () => {
    logger.info('Worker shutting down');
    clearInterval(keepAlive);
    clearInterval(presenceInterval);
    jobLoopController.abort();
    await jobLoopPromise.catch(() => undefined);
    await musicService.shutdown().catch((error: unknown) => {
      logger.warn({ err: error }, 'Music playback service shutdown reported error');
    });
    await client.destroy();
    await unregisterWorkerFromPool(redis, claim.workerId).catch((error: unknown) => {
      logger.warn({ err: error, workerId: claim.workerId }, 'Failed to unregister worker from pool');
    });
    await claim.release();
    await telemetry.shutdown();
    redis.disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  const logger = createLogger({ name: 'worker' });
  logger.error({ err: error }, 'Worker failed to start');
  process.exit(1);
});

async function handleJob(
  client: Client,
  job: JobEnvelope,
  workerId: string,
  logger: ReturnType<typeof createLogger>,
  services: WorkerServices,
): Promise<void> {
  logger.info({ workerId, jobType: job.type, jobId: job.id }, 'Received job from queue');

  switch (job.type) {
    case 'ping.respond':
      await handlePingRespondJob(client, job, workerId, logger);
      break;
    default: {
      if (!isGuildCommandJob(job)) {
        const unexpectedJob = job as JobEnvelope;
        logger.warn(
          { workerId, jobType: unexpectedJob.type, jobId: unexpectedJob.id },
          'No handler registered for job type',
        );
        break;
      }

      await handleGuildCommandJob(client, job, workerId, logger, services);
      break;
    }
  }
}

async function handlePingRespondJob(
  client: Client,
  job: PingRespondJob,
  workerId: string,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  logger.info(
    { workerId, jobId: job.id, guildId: job.guildId, channelId: job.channelId, requesterId: job.requester.userId },
    'Handling ping.respond job',
  );

  let channel: Awaited<ReturnType<typeof client.channels.fetch>>;
  try {
    channel = await client.channels.fetch(job.channelId);
    logger.info(
      {
        workerId,
        jobId: job.id,
        guildId: job.guildId,
        channelId: job.channelId,
        requesterId: job.requester.userId,
        channelType: channel?.type ?? null,
        channelResolved: channel !== null,
      },
      'Fetched channel for ping.respond job',
    );
  } catch (error) {
    logger.error(
      { err: error, workerId, jobId: job.id, guildId: job.guildId, channelId: job.channelId },
      'Failed to fetch channel for ping.respond job',
    );
    throw error;
  }

  let textChannel: ReturnType<typeof ensureTextChannel>;
  try {
    textChannel = ensureTextChannel(channel);
  } catch (error) {
    logger.error(
      {
        err: error,
        workerId,
        jobId: job.id,
        guildId: job.guildId,
        channelId: job.channelId,
        requesterId: job.requester.userId,
        channelType: channel?.type ?? null,
      },
      'Resolved channel is not text-based for ping.respond job',
    );
    throw error;
  }

  const responder = client.user?.tag ?? workerId;

  let messageId: string | undefined;
  try {
    const responseMessage = await textChannel.send({
      content: `Pong from ${responder}! (requested by <@${job.requester.userId}>)`,
    });
    messageId = responseMessage.id;
  } catch (error) {
    logger.error(
      {
        err: error,
        workerId,
        jobId: job.id,
        guildId: job.guildId,
        channelId: job.channelId,
        requesterId: job.requester.userId,
      },
      'Failed to send pong message for ping.respond job',
    );
    throw error;
  }

  logger.info(
    {
      workerId,
      jobId: job.id,
      guildId: job.guildId,
      channelId: job.channelId,
      requesterId: job.requester.userId,
      messageId: messageId ?? null,
    },
    'Completed ping.respond job',
  );
}

function isGuildCommandJob(job: JobEnvelope): job is GuildCommandJob {
  return (
    typeof (job as Partial<GuildCommandJobBase>).textChannelId === 'string' &&
    typeof (job as Partial<GuildCommandJobBase>).source === 'string'
  );
}

async function handleGuildCommandJob(
  client: Client,
  job: GuildCommandJob,
  workerId: string,
  logger: ReturnType<typeof createLogger>,
  services: WorkerServices,
): Promise<void> {
  logger.info(
    {
      workerId,
      jobType: job.type,
      jobId: job.id,
      guildId: job.guildId,
      textChannelId: job.textChannelId,
      voiceChannelId: job.voiceChannelId ?? null,
      requesterId: job.requester.userId,
    },
    'Handling guild command job (placeholder)',
  );

  const targetWorkerId = (job as { targetWorkerId?: string }).targetWorkerId;
  if (typeof targetWorkerId === 'string' && targetWorkerId.length > 0 && targetWorkerId !== workerId) {
    logger.debug(
      { workerId, jobId: job.id, targetWorkerId, guildId: job.guildId },
      'Ignoring guild command job targeted at another worker',
    );
    return;
  }

  let channel: Awaited<ReturnType<typeof client.channels.fetch>>;
  try {
    channel = await client.channels.fetch(job.textChannelId);
  } catch (error) {
    logger.error(
      { err: error, workerId, jobId: job.id, guildId: job.guildId, textChannelId: job.textChannelId },
      'Failed to fetch text channel for guild command job',
    );
    return;
  }

  let textChannel: ReturnType<typeof ensureTextChannel>;
  try {
    textChannel = ensureTextChannel(channel);
  } catch (error) {
    logger.error(
      { err: error, workerId, jobId: job.id, guildId: job.guildId, textChannelId: job.textChannelId },
      'Channel is not text-based for guild command job',
    );
    return;
  }

  const musicResponse = await services.music.handle(job, textChannel);
  if (musicResponse.handled) {
    if (musicResponse.payload) {
      try {
        await textChannel.send(musicResponse.payload);
      } catch (error) {
        logger.error(
          { err: error, workerId, jobId: job.id, guildId: job.guildId, textChannelId: job.textChannelId },
          'Failed to send music response message',
        );
      }
    }
    return;
  }

  const summary = formatJobSummary(job.type);
  const responder = client.user?.tag ?? workerId;
  const message = `🛠️  <@${job.requester.userId}>, ${summary} is queued but the worker implementation is not ready yet. (${responder})`;

  try {
    await textChannel.send({ content: message });
  } catch (error) {
    logger.error(
      { err: error, workerId, jobId: job.id, guildId: job.guildId, textChannelId: job.textChannelId },
      'Failed to send placeholder response for guild command job',
    );
    return;
  }

  logger.info(
    {
      workerId,
      jobType: job.type,
      jobId: job.id,
      guildId: job.guildId,
      textChannelId: job.textChannelId,
    },
    'Sent placeholder guild command response',
  );
}

function formatJobSummary(type: JobEnvelope['type']): string {
  const summaries: Partial<Record<JobEnvelope['type'], string>> = {
    'music.play': 'your music playback request',
    'music.skip': 'the skip request',
    'music.pause': 'the pause request',
    'music.resume': 'the resume request',
    'music.stop': 'the stop request',
    'music.queue': 'the queue lookup',
    'music.volume': 'the volume request',
    'music.favorite.add': 'the favourite-save request',
    'music.favorite.play': 'the favourite playback request',
    'music.playlist.create': 'the playlist creation request',
    'music.playlist.add': 'the playlist update',
    'music.playlist.list': 'the playlist listing request',
    'music.playlist.play': 'the playlist playback request',
    'radio.start': 'the radio start request',
    'radio.stop': 'the radio stop request',
    'radio.genre.list': 'the radio genre lookup',
    'game.turtle.start': 'the Turtle Soup start request',
    'game.turtle.hint': 'the Turtle Soup hint request',
    'game.turtle.summary': 'the Turtle Soup summary request',
    'game.werewolf.setup': 'the Werewolf setup request',
    'game.werewolf.start': 'the Werewolf start request',
    'game.werewolf.vote': 'the Werewolf vote request',
    'game.werewolf.status': 'the Werewolf status request',
    'game.undercover.start': 'the Undercover start request',
    'game.undercover.vote': 'the Undercover vote request',
    'game.undercover.status': 'the Undercover status request',
  };

  return summaries[type] ?? `the ${type} request`;
}

type TextSendMethod = TextChannel['send'];

function ensureTextChannel(channel: unknown): TextBasedChannel & { send: TextSendMethod } {
  if (!channel) {
    throw new Error('Channel not found for ping.respond job');
  }

  const candidate = channel as TextBasedChannel;
  if (typeof (candidate as { send?: unknown }).send !== 'function') {
    throw new Error('Channel is not text-based');
  }

  return candidate as TextBasedChannel & { send: TextSendMethod };
}

interface WorkerServices {
  music: MusicPlaybackService;
}
