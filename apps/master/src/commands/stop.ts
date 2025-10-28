import { SlashCommandBuilder } from 'discord.js';
import { generateJobId } from '@anankor/ipc';
import type { MusicStopJob } from '@anankor/schemas';
import type { ChatInputCommand } from './types.js';
import {
  buildInteractionMetadata,
  buildMessageMetadata,
  getVoiceChannelIdFromInteraction,
  getVoiceChannelIdFromMessage,
  replyToInteraction,
} from './utils.js';

const COMMAND_NAME = 'stop';
const STOP_PREFIX_ALIASES = ['stop', 'st', 'leave', 'dc'];

export function createStopCommand(): ChatInputCommand {
  return {
    data: new SlashCommandBuilder().setName(COMMAND_NAME).setDescription('Stop playback, clear the queue, and disconnect.'),
    prefixNames: STOP_PREFIX_ALIASES,
    async execute(interaction, context) {
      const metadata = buildInteractionMetadata(interaction);
      if (!metadata) {
        await replyToInteraction(interaction, 'This command can only be used inside a Discord server.');
        return;
      }

      const voiceChannelId = getVoiceChannelIdFromInteraction(interaction);
      if (!voiceChannelId) {
        await replyToInteraction(interaction, 'Join a voice channel before stopping playback.');
        return;
      }

      const job: MusicStopJob = {
        id: generateJobId(),
        type: 'music.stop',
        idempotencyKey: `music.stop:${interaction.id}`,
        createdAt: new Date(),
        guildId: metadata.guildId,
        textChannelId: metadata.textChannelId,
        voiceChannelId,
        requester: metadata.requester,
        source: metadata.source,
        locale: metadata.locale,
        clearQueue: true,
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
          'Enqueued music.stop job',
        );
        await replyToInteraction(interaction, 'Stopping playback and clearing the queue.');
      } catch (error) {
        context.logger.error(
          { err: error, guildId: job.guildId, voiceChannelId: job.voiceChannelId, jobId: job.id },
          'Failed to enqueue music.stop job',
        );
        await replyToInteraction(interaction, 'Unable to stop playback right now. Please try again.');
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
        await message.reply('Join a voice channel before stopping playback.');
        return;
      }

      const job: MusicStopJob = {
        id: generateJobId(),
        type: 'music.stop',
        idempotencyKey: `music.stop:${message.id}`,
        createdAt: new Date(),
        guildId: metadata.guildId,
        textChannelId: metadata.textChannelId,
        voiceChannelId,
        requester: metadata.requester,
        source: metadata.source,
        locale: metadata.locale,
        clearQueue: true,
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
          'Enqueued music.stop job (prefix)',
        );
        await message.reply('Stopping playback and clearing the queue.');
      } catch (error) {
        context.logger.error(
          { err: error, guildId: job.guildId, voiceChannelId: job.voiceChannelId, jobId: job.id },
          'Failed to enqueue music.stop job from prefix command',
        );
        await message.reply('Unable to stop playback right now. Please try again.');
      }
    },
  };
}
