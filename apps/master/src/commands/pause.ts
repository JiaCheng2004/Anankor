import { SlashCommandBuilder } from 'discord.js';
import { generateJobId } from '@anankor/ipc';
import type { MusicPauseJob } from '@anankor/schemas';
import type { ChatInputCommand } from './types.js';
import {
  buildInteractionMetadata,
  buildMessageMetadata,
  getVoiceChannelIdFromInteraction,
  getVoiceChannelIdFromMessage,
  replyToInteraction,
  resolveSchedulerErrorMessage,
} from './utils.js';

const COMMAND_NAME = 'pause';
const PAUSE_PREFIX_ALIASES = ['pause', 'pa', 'hold', 'freeze'];

export function createPauseCommand(): ChatInputCommand {
  return {
    data: new SlashCommandBuilder().setName(COMMAND_NAME).setDescription('Pause the current playback session.'),
    prefixNames: PAUSE_PREFIX_ALIASES,
    async execute(interaction, context) {
      const metadata = buildInteractionMetadata(interaction);
      if (!metadata) {
        await replyToInteraction(interaction, 'This command can only be used inside a Discord server.');
        return;
      }

      const voiceChannelId = getVoiceChannelIdFromInteraction(interaction);
      if (!voiceChannelId) {
        await replyToInteraction(interaction, 'Join a voice channel before pausing playback.');
        return;
      }

      const job: MusicPauseJob = {
        id: generateJobId(),
        type: 'music.pause',
        idempotencyKey: `music.pause:${interaction.id}`,
        createdAt: new Date(),
        guildId: metadata.guildId,
        textChannelId: metadata.textChannelId,
        voiceChannelId,
        requester: metadata.requester,
        source: metadata.source,
        locale: metadata.locale,
      };

      try {
        const entryId = await context.enqueueJob(job);
        context.logger.info(
          {
            jobId: job.id,
            entryId,
            guildId: job.guildId,
            voiceChannelId: job.voiceChannelId,
          },
          'Enqueued music.pause job',
        );
        await replyToInteraction(interaction, 'Playback paused.');
      } catch (error) {
        const schedulerMessage = resolveSchedulerErrorMessage(error);
        if (schedulerMessage) {
          await replyToInteraction(interaction, schedulerMessage);
          return;
        }
        context.logger.error(
          { err: error, guildId: job.guildId, voiceChannelId: job.voiceChannelId, jobId: job.id },
          'Failed to enqueue music.pause job',
        );
        await replyToInteraction(interaction, 'Unable to pause right now. Please try again.');
      }
    },
    async executePrefix(message, _args, context, _alias) {
      const metadata = buildMessageMetadata(message);
      if (!metadata) {
        await message.reply('This command can only be used inside a Discord server.');
        return;
      }

      const voiceChannelId = getVoiceChannelIdFromMessage(message);
      if (!voiceChannelId) {
        await message.reply('Join a voice channel before pausing playback.');
        return;
      }

      const job: MusicPauseJob = {
        id: generateJobId(),
        type: 'music.pause',
        idempotencyKey: `music.pause:${message.id}`,
        createdAt: new Date(),
        guildId: metadata.guildId,
        textChannelId: metadata.textChannelId,
        voiceChannelId,
        requester: metadata.requester,
        source: metadata.source,
        locale: metadata.locale,
      };

      try {
        const entryId = await context.enqueueJob(job);
        context.logger.info(
          {
            jobId: job.id,
            entryId,
            guildId: job.guildId,
            voiceChannelId: job.voiceChannelId,
          },
          'Enqueued music.pause job (prefix)',
        );
        await message.reply('Playback paused.');
      } catch (error) {
        const schedulerMessage = resolveSchedulerErrorMessage(error);
        if (schedulerMessage) {
          await message.reply(schedulerMessage);
          return;
        }
        context.logger.error(
          { err: error, guildId: job.guildId, voiceChannelId: job.voiceChannelId, jobId: job.id },
          'Failed to enqueue music.pause job from prefix command',
        );
        await message.reply('Unable to pause right now. Please try again.');
      }
    },
  };
}
