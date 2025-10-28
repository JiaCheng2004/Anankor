import { SlashCommandBuilder } from 'discord.js';
import { generateJobId } from '@anankor/ipc';
import type { MusicResumeJob } from '@anankor/schemas';
import type { ChatInputCommand } from './types.js';
import {
  buildInteractionMetadata,
  buildMessageMetadata,
  getVoiceChannelIdFromInteraction,
  getVoiceChannelIdFromMessage,
  replyToInteraction,
} from './utils.js';

const COMMAND_NAME = 'resume';
const RESUME_PREFIX_ALIASES = ['resume', 'res', 'unpause', 'continue', 'go'];

export function createResumeCommand(): ChatInputCommand {
  return {
    data: new SlashCommandBuilder().setName(COMMAND_NAME).setDescription('Resume playback if it is paused.'),
    prefixNames: RESUME_PREFIX_ALIASES,
    async execute(interaction, context) {
      const metadata = buildInteractionMetadata(interaction);
      if (!metadata) {
        await replyToInteraction(interaction, 'This command can only be used inside a Discord server.');
        return;
      }

      const voiceChannelId = getVoiceChannelIdFromInteraction(interaction);
      if (!voiceChannelId) {
        await replyToInteraction(interaction, 'Join a voice channel before resuming playback.');
        return;
      }

      const job: MusicResumeJob = {
        id: generateJobId(),
        type: 'music.resume',
        idempotencyKey: `music.resume:${interaction.id}`,
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
          'Enqueued music.resume job',
        );
        await replyToInteraction(interaction, 'Resuming playback.');
      } catch (error) {
        context.logger.error(
          { err: error, guildId: job.guildId, voiceChannelId: job.voiceChannelId, jobId: job.id },
          'Failed to enqueue music.resume job',
        );
        await replyToInteraction(interaction, 'Unable to resume right now. Please try again.');
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
        await message.reply('Join a voice channel before resuming playback.');
        return;
      }

      const job: MusicResumeJob = {
        id: generateJobId(),
        type: 'music.resume',
        idempotencyKey: `music.resume:${message.id}`,
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
          'Enqueued music.resume job (prefix)',
        );
        await message.reply('Resuming playback.');
      } catch (error) {
        context.logger.error(
          { err: error, guildId: job.guildId, voiceChannelId: job.voiceChannelId, jobId: job.id },
          'Failed to enqueue music.resume job from prefix command',
        );
        await message.reply('Unable to resume right now. Please try again.');
      }
    },
  };
}
