import { SlashCommandBuilder } from 'discord.js';
import { generateJobId } from '@anankor/ipc';
import type { MusicQueueJob } from '@anankor/schemas';
import type { ChatInputCommand } from './types.js';
import {
  buildInteractionMetadata,
  buildMessageMetadata,
  getVoiceChannelIdFromInteraction,
  getVoiceChannelIdFromMessage,
  replyToInteraction,
  resolveSchedulerErrorMessage,
} from './utils.js';

const COMMAND_NAME = 'queue';
const QUEUE_PREFIX_ALIASES = ['queue', 'q', 'upnext', 'list'];

export function createQueueCommand(): ChatInputCommand {
  return {
    data: new SlashCommandBuilder()
      .setName(COMMAND_NAME)
      .setDescription('Display the upcoming tracks in the queue.')
      .addIntegerOption((option) =>
        option
          .setName('page')
          .setDescription('Page of the queue to display.')
          .setMinValue(1)
          .setRequired(false),
      ),
    prefixNames: QUEUE_PREFIX_ALIASES,
    async execute(interaction, context) {
      const metadata = buildInteractionMetadata(interaction);
      if (!metadata) {
        await replyToInteraction(interaction, 'This command can only be used inside a Discord server.');
        return;
      }

      const voiceChannelId = getVoiceChannelIdFromInteraction(interaction);
      if (!voiceChannelId) {
        await replyToInteraction(interaction, 'Join a voice channel to view its queue.');
        return;
      }

      const page = interaction.options.getInteger('page') ?? undefined;

      const job: MusicQueueJob = {
        id: generateJobId(),
        type: 'music.queue',
        idempotencyKey: `music.queue:${interaction.id}`,
        createdAt: new Date(),
        guildId: metadata.guildId,
        textChannelId: metadata.textChannelId,
        voiceChannelId,
        requester: metadata.requester,
        source: metadata.source,
        locale: metadata.locale,
        page,
      };

      try {
        const entryId = await context.enqueueJob(job);
        context.logger.info(
          { jobId: job.id, entryId, guildId: job.guildId, page: job.page ?? 1 },
          'Enqueued music.queue job',
        );
        await replyToInteraction(interaction, 'Fetching the queue...');
      } catch (error) {
        const schedulerMessage = resolveSchedulerErrorMessage(error);
        if (schedulerMessage) {
          await replyToInteraction(interaction, schedulerMessage);
          return;
        }
        context.logger.error({ err: error, guildId: job.guildId, jobId: job.id }, 'Failed to enqueue music.queue job');
        await replyToInteraction(interaction, 'Unable to fetch the queue right now. Please try again shortly.');
      }
    },
    async executePrefix(message, args, context, _alias) {
      const metadata = buildMessageMetadata(message);
      if (!metadata) {
        await message.reply('This command can only be used inside a Discord server.');
        return;
      }

      const voiceChannelId = getVoiceChannelIdFromMessage(message);
      if (!voiceChannelId) {
        await message.reply('Join a voice channel to view its queue.');
        return;
      }

      const parsedPage = args[0] ? Number.parseInt(args[0], 10) : Number.NaN;
      const page = Number.isNaN(parsedPage) ? undefined : Math.max(1, parsedPage);

      const job: MusicQueueJob = {
        id: generateJobId(),
        type: 'music.queue',
        idempotencyKey: `music.queue:${message.id}`,
        createdAt: new Date(),
        guildId: metadata.guildId,
        textChannelId: metadata.textChannelId,
        voiceChannelId,
        requester: metadata.requester,
        source: metadata.source,
        locale: metadata.locale,
        page,
      };

      try {
        const entryId = await context.enqueueJob(job);
        context.logger.info(
          { jobId: job.id, entryId, guildId: job.guildId, page: job.page ?? 1 },
          'Enqueued music.queue job (prefix)',
        );
        await message.reply('Fetching the queue...');
      } catch (error) {
        const schedulerMessage = resolveSchedulerErrorMessage(error);
        if (schedulerMessage) {
          await message.reply(schedulerMessage);
          return;
        }
        context.logger.error({ err: error, guildId: job.guildId, jobId: job.id }, 'Failed to enqueue music.queue job');
        await message.reply('Unable to fetch the queue right now. Please try again shortly.');
      }
    },
  };
}
