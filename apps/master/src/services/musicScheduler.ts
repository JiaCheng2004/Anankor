import type { Client, TextBasedChannel, MessageCreateOptions } from 'discord.js';
import {
  addGuildSession,
  addWorkerSession,
  appendQueueEntry,
  buildWorkerJobStreamKey,
  computeSessionKey,
  ensureJobConsumerGroup,
  fetchWorkerPool,
  getSessionMetadata,
  guildSessionCount,
  MusicQueueEntry,
  MusicSessionMetadata,
  publishJob,
  releaseSessionBindings,
  removeGuildSession,
  removeWorkerSession,
  setCurrentEntry,
  setSessionMetadata,
  touchSession,
  workerSessionCount,
  WORKER_JOB_STREAM_PREFIX,
  isWorkerPresent,
  listGuildSessions,
} from '@anankor/ipc';
import type {
  JobEnvelope,
  MusicPauseJob,
  MusicPlayJob,
  MusicQueueJob,
  MusicResumeJob,
  MusicSkipJob,
  MusicStopJob,
  MusicVolumeJob,
} from '@anankor/schemas';
import { KEYSPACES } from '@anankor/storage';
import type { RedisClient } from '@anankor/ipc';
import type { createLogger } from '@anankor/logger';

const MUSIC_GUILD_WORKER_CAP_DEFAULT = 5;

type MusicJob =
  | MusicPlayJob
  | MusicPauseJob
  | MusicResumeJob
  | MusicSkipJob
  | MusicStopJob
  | MusicQueueJob
  | MusicVolumeJob;

interface SchedulerOptions {
  guildWorkerCap?: number;
  idleTimeoutSeconds?: number;
  consumerGroup?: string;
}

interface EnsureSessionResult {
  sessionKey: string;
  workerId: string;
  metadata: MusicSessionMetadata;
  isNew: boolean;
  crashed?: boolean;
}

export class MusicSchedulerError extends Error {
  constructor(
    public readonly code: 'NO_WORKERS' | 'GUILD_AT_CAP' | 'SESSION_STALE',
    message: string,
  ) {
    super(message);
    this.name = 'MusicSchedulerError';
  }
}

export class MusicScheduler {
  private readonly guildWorkerCap: number;
  private readonly idleTimeoutSeconds: number;
  private readonly consumerGroup: string;

  constructor(
    private readonly redis: RedisClient,
    private readonly client: Client,
    private readonly logger: ReturnType<typeof createLogger>,
    options: SchedulerOptions = {},
  ) {
    this.guildWorkerCap = options.guildWorkerCap ?? MUSIC_GUILD_WORKER_CAP_DEFAULT;
    this.idleTimeoutSeconds = options.idleTimeoutSeconds ?? 600;
    this.consumerGroup = options.consumerGroup ?? 'anankor-workers';
  }

  public async trySchedule(job: JobEnvelope): Promise<string | null> {
    if (!this.isMusicJob(job)) {
      return null;
    }

    switch (job.type) {
      case 'music.play':
        return this.handlePlay(job);
      case 'music.pause':
      case 'music.resume':
      case 'music.skip':
      case 'music.stop':
      case 'music.queue':
      case 'music.volume':
        return this.handleControl(job);
      default:
        return null;
    }
  }

  private isMusicJob(job: JobEnvelope): job is MusicJob {
    return job.type.startsWith('music.');
  }

  private async handlePlay(job: MusicPlayJob): Promise<string> {
    if (!job.voiceChannelId) {
      throw new Error('music.play job missing voiceChannelId');
    }

    const ensureResult = await this.ensureSession(job);
    const queueEntry: MusicQueueEntry = {
      id: job.id,
      query: job.query,
      requester: job.requester,
      textChannelId: job.textChannelId,
      locale: job.locale,
      source: job.source,
      enqueuedAt: Date.now(),
    };

    const newLength = await appendQueueEntry(this.redis, ensureResult.sessionKey, queueEntry);
    await touchSession(this.redis, ensureResult.sessionKey);
    await setSessionMetadata(this.redis, {
      ...ensureResult.metadata,
      textChannelId: job.textChannelId,
      locale: job.locale ?? ensureResult.metadata.locale,
      lastActive: Date.now(),
    });

    if (newLength === 1) {
      await setCurrentEntry(this.redis, ensureResult.sessionKey, queueEntry);
    }

    const workerJob: MusicPlayJob = {
      ...job,
      sessionKey: ensureResult.sessionKey,
      targetWorkerId: ensureResult.workerId,
      queueEntryId: queueEntry.id,
      queuePosition: newLength,
    };

    const streamKey = buildWorkerJobStreamKey(ensureResult.workerId);
    await ensureJobConsumerGroup(this.redis, this.consumerGroup, streamKey);
    return publishJob(this.redis, workerJob, streamKey);
  }

  private async handleControl(job: Exclude<MusicJob, MusicPlayJob>): Promise<string> {
    if (!job.voiceChannelId && job.type !== 'music.queue') {
      throw new Error(`${job.type} job missing voiceChannelId`);
    }

    const ensureResult = await this.ensureSession(job, { allowCreate: false });

    await touchSession(this.redis, ensureResult.sessionKey);
    const workerJob = {
      ...job,
      sessionKey: ensureResult.sessionKey,
      targetWorkerId: ensureResult.workerId,
    } as MusicJob;

    const streamKey = buildWorkerJobStreamKey(ensureResult.workerId);
    await ensureJobConsumerGroup(this.redis, this.consumerGroup, streamKey);
    return publishJob(this.redis, workerJob, streamKey);
  }

  private async ensureSession(
    job: MusicJob,
    options: { allowCreate?: boolean } = {},
  ): Promise<EnsureSessionResult> {
    if (!job.voiceChannelId) {
      throw new Error('Voice channel required for music job');
    }

    const { allowCreate = true } = options;
    const sessionKey = computeSessionKey(job.guildId, job.voiceChannelId);
    let workerId = await this.redis.get(KEYSPACES.musicAffinity(sessionKey));
    let crashed = false;

    if (workerId) {
      const present = await isWorkerPresent(this.redis, workerId);
      if (!present) {
        crashed = true;
        const metadata = await getSessionMetadata(this.redis, sessionKey);
        await releaseSessionBindings(this.redis, sessionKey, metadata);
        await this.notifySessionCrash(metadata);
        workerId = null;
      } else {
        const metadata = await getSessionMetadata(this.redis, sessionKey);
        if (metadata) {
          return {
            sessionKey,
            workerId,
            metadata,
            isNew: false,
          };
        }
      }
    }

    if (!allowCreate) {
      throw new MusicSchedulerError('SESSION_STALE', 'No active music session found for this voice channel');
    }

    if (crashed) {
      this.logger.warn({ sessionKey }, 'Recovered crashed music session');
    }

    await this.pruneStaleGuildSessions(job.guildId);

    const activeSessions = await guildSessionCount(this.redis, job.guildId);
    if (activeSessions >= this.guildWorkerCap) {
      throw new MusicSchedulerError('GUILD_AT_CAP', 'Guild reached concurrent music session limit');
    }

    const selectedWorker = await this.selectWorker();
    if (!selectedWorker) {
      throw new MusicSchedulerError('NO_WORKERS', 'No worker bots available for playback');
    }

    const affinityKey = KEYSPACES.musicAffinity(sessionKey);
    const setResult = await this.redis.setnx(affinityKey, selectedWorker);
    if (setResult !== 1) {
      const existingWorker = await this.redis.get(affinityKey);
      if (!existingWorker) {
        throw new MusicSchedulerError('NO_WORKERS', 'Session affinity handshake failed');
      }
      const metadata = await getSessionMetadata(this.redis, sessionKey);
      if (!metadata) {
        throw new MusicSchedulerError('SESSION_STALE', 'Session metadata missing after affinity acquired');
      }
      return {
        sessionKey,
        workerId: existingWorker,
        metadata,
        isNew: false,
      };
    }

    await this.redis.expire(affinityKey, this.idleTimeoutSeconds);

    workerId = selectedWorker;
    await addGuildSession(this.redis, job.guildId, sessionKey);
    await addWorkerSession(this.redis, workerId, sessionKey);
    await touchSession(this.redis, sessionKey);

    const metadata: MusicSessionMetadata = {
      sessionKey,
      guildId: job.guildId,
      voiceChannelId: job.voiceChannelId,
      workerId,
      textChannelId: job.textChannelId,
      locale: job.locale,
      lastActive: Date.now(),
    };

    await setSessionMetadata(this.redis, metadata);
    return {
      sessionKey,
      workerId,
      metadata,
      isNew: true,
    };
  }

  private async selectWorker(): Promise<string | null> {
    const workerIds = await fetchWorkerPool(this.redis);
    let best: { workerId: string; load: number } | null = null;

    for (const workerId of workerIds) {
      const present = await isWorkerPresent(this.redis, workerId);
      if (!present) {
        await this.redis.srem(KEYSPACES.workerPool, workerId);
        continue;
      }

      const load = await workerSessionCount(this.redis, workerId);
      if (!best || load < best.load) {
        best = { workerId, load };
      }
    }

    return best?.workerId ?? null;
  }

  private async notifySessionCrash(metadata: MusicSessionMetadata | null): Promise<void> {
    if (!metadata) {
      return;
    }

    try {
      const channel = await this.client.channels.fetch(metadata.textChannelId);
      if (!channel || !this.isTextChannel(channel)) {
        return;
      }
      await channel.send('Playback crashed, retry /play.');
    } catch (error) {
      this.logger.warn(
        { err: error, guildId: metadata.guildId, textChannelId: metadata.textChannelId },
        'Failed to notify channel about crashed session',
      );
    }
  }

  private isTextChannel(
    channel: unknown,
  ): channel is TextBasedChannel & { send: (options: string | MessageCreateOptions) => Promise<unknown> } {
    return Boolean(channel && typeof (channel as { send?: unknown }).send === 'function');
  }

  private async pruneStaleGuildSessions(guildId: string): Promise<void> {
    const sessions = await listGuildSessions(this.redis, guildId);
    if (sessions.length === 0) {
      return;
    }

    for (const sessionKey of sessions) {
      const affinityExists = await this.redis.exists(KEYSPACES.musicAffinity(sessionKey));
      if (affinityExists === 1) {
        continue;
      }

      const metadata = await getSessionMetadata(this.redis, sessionKey);
      await releaseSessionBindings(this.redis, sessionKey, metadata);
      if (metadata) {
        await removeGuildSession(this.redis, metadata.guildId, sessionKey);
        await removeWorkerSession(this.redis, metadata.workerId, sessionKey);
      }
    }
  }
}
