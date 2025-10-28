import { SlashCommandBuilder } from 'discord.js';
import { generateJobId } from '@anankor/ipc';
import type { PingRespondJob } from '@anankor/schemas';
import type { ChatInputCommand, CommandContext } from './types.js';

const COMMAND_NAME = 'ping';

export const pingCommand: ChatInputCommand = {
  data: new SlashCommandBuilder()
    .setName(COMMAND_NAME)
    .setDescription('Dispatch a ping to the worker pool and await a pong response.'),
  prefixNames: ['ping', 'pong'],
  async execute(interaction, context) {
    context.logger.info(
      {
        interactionId: interaction.id,
        guildId: interaction.guildId ?? null,
        channelId: interaction.channelId ?? null,
        requesterId: interaction.user.id,
      },
      'Received ping command interaction',
    );

    const respond = async (content: string, stage: string) => {
      context.logger.info(
        {
          interactionId: interaction.id,
          guildId: interaction.guildId ?? null,
          channelId: interaction.channelId ?? null,
          requesterId: interaction.user.id,
          stage,
        },
        'Responding to ping command interaction',
      );

      const payload = { content, ephemeral: true } as const;
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    };

    if (!interaction.inCachedGuild() || !interaction.guildId) {
      await respond('This command can only be used inside a Discord server.', 'not_in_cached_guild');
      return;
    }

    if (!interaction.channelId) {
      await respond('Unable to determine the channel to respond in.', 'missing_channel_id');
      return;
    }

    await enqueuePingJob({
      context,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      requesterId: interaction.user.id,
      requesterTag: interaction.user.tag,
      idempotencyKey: interaction.id,
      respond: (content, stage) => respond(content, stage),
      source: 'interaction',
    });
  },
  async executePrefix(message, _args, context, _alias) {
    context.logger.info(
      {
        messageId: message.id,
        guildId: message.guildId ?? null,
        channelId: message.channelId,
        authorId: message.author.id,
      },
      'Received ping prefix command',
    );

    if (!message.guildId) {
      await message.reply('This command can only be used inside a Discord server.');
      return;
    }

    const respond = async (content: string, stage: string) => {
      context.logger.info(
        {
          messageId: message.id,
          guildId: message.guildId,
          channelId: message.channelId,
          authorId: message.author.id,
          stage,
        },
        'Responding to ping prefix command',
      );
      await message.reply(content);
    };

    await enqueuePingJob({
      context,
      guildId: message.guildId,
      channelId: message.channelId,
      requesterId: message.author.id,
      requesterTag: message.author.tag,
      idempotencyKey: message.id,
      respond,
      source: 'prefix',
    });
  },
};

type PingCommandSource = 'interaction' | 'prefix';

interface PingJobParams {
  context: CommandContext;
  guildId: string;
  channelId: string;
  requesterId: string;
  requesterTag: string;
  idempotencyKey: string;
  respond: (content: string, stage: string) => Promise<void>;
  source: PingCommandSource;
}

async function enqueuePingJob(params: PingJobParams): Promise<void> {
  const { context, guildId, channelId, requesterId, requesterTag, idempotencyKey, respond, source } = params;

  const job: PingRespondJob = {
    id: generateJobId(),
    type: 'ping.respond',
    idempotencyKey: `ping:${idempotencyKey}`,
    createdAt: new Date(),
    guildId,
    channelId,
    requester: {
      userId: requesterId,
      username: requesterTag,
    },
  };

  try {
    context.logger.info(
      {
        jobId: job.id,
        idempotencyKey: job.idempotencyKey,
        guildId: job.guildId,
        channelId: job.channelId,
        requesterId: job.requester.userId,
        createdAt: job.createdAt.toISOString(),
        source,
      },
      'Dispatching ping.respond job',
    );

    const entryId = await context.enqueueJob(job);
    context.logger.info(
      {
        jobId: job.id,
        entryId,
        guildId: job.guildId,
        channelId: job.channelId,
        requesterId: job.requester.userId,
        source,
      },
      'Enqueued ping.respond job',
    );
    await respond('Handed off your ping to the worker pool. Watch the channel for a response.', 'enqueue_success');
  } catch (error) {
    context.logger.error(
      { err: error, jobId: job.id, guildId: job.guildId, channelId: job.channelId, source },
      'Failed to enqueue ping.respond job',
    );
    await respond('Unable to reach a worker right now. Please try again in a moment.', 'enqueue_failure');
  }
}
