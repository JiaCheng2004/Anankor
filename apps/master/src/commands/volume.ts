import { SlashCommandBuilder } from 'discord.js';
import { generateJobId } from '@anankor/ipc';
import type { MusicVolumeJob } from '@anankor/schemas';
import type { ChatInputCommand } from './types.js';
import {
  buildInteractionMetadata,
  buildMessageMetadata,
  getVoiceChannelIdFromInteraction,
  getVoiceChannelIdFromMessage,
  replyToInteraction,
  resolveSchedulerErrorMessage,
} from './utils.js';

const COMMAND_NAME = 'volume';
const VOLUME_PREFIX_ALIASES = ['volume', 'vol', 'v', 'loud'];

export function createVolumeCommand(): ChatInputCommand {
  return {
    data: new SlashCommandBuilder()
      .setName(COMMAND_NAME)
      .setDescription('Get or set the playback volume.')
      .addIntegerOption((option) =>
        option
          .setName('level')
          .setDescription('Desired volume between 0 and 200.')
          .setMinValue(0)
          .setMaxValue(200)
          .setRequired(false),
      ),
    prefixNames: VOLUME_PREFIX_ALIASES,
    async execute(interaction, context) {
      const metadata = buildInteractionMetadata(interaction);
      if (!metadata) {
        await replyToInteraction(interaction, 'This command can only be used inside a Discord server.');
        return;
      }

      const voiceChannelId = getVoiceChannelIdFromInteraction(interaction);
      if (!voiceChannelId) {
        await replyToInteraction(interaction, 'Join a voice channel to adjust or view the volume.');
        return;
      }

      const levelOption = interaction.options.getInteger('level');
      const job: MusicVolumeJob = {
        id: generateJobId(),
        type: 'music.volume',
        idempotencyKey: `music.volume:${interaction.id}`,
        createdAt: new Date(),
        guildId: metadata.guildId,
        textChannelId: metadata.textChannelId,
        voiceChannelId,
        requester: metadata.requester,
        source: metadata.source,
        locale: metadata.locale,
        level: levelOption ?? undefined,
      };

      try {
        const entryId = await context.enqueueJob(job);
        context.logger.info(
          {
            jobId: job.id,
            entryId,
            guildId: job.guildId,
            voiceChannelId: job.voiceChannelId,
            level: job.level ?? null,
          },
          'Enqueued music.volume job',
        );
        await replyToInteraction(
          interaction,
          levelOption !== null && levelOption !== undefined
            ? `Setting volume to ${levelOption}%.`
            : 'Retrieving the current volume...',
        );
      } catch (error) {
        const schedulerMessage = resolveSchedulerErrorMessage(error);
        if (schedulerMessage) {
          await replyToInteraction(interaction, schedulerMessage);
          return;
        }
        context.logger.error(
          { err: error, guildId: job.guildId, voiceChannelId: job.voiceChannelId, jobId: job.id },
          'Failed to enqueue music.volume job',
        );
        await replyToInteraction(interaction, 'Unable to process your volume request right now. Please try again later.');
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
        await message.reply('Join a voice channel to adjust or view the volume.');
        return;
      }

      const parsedLevel = args[0] ? Number.parseInt(args[0], 10) : Number.NaN;
      const level = Number.isNaN(parsedLevel) ? undefined : Math.max(0, Math.min(200, parsedLevel));

      const job: MusicVolumeJob = {
        id: generateJobId(),
        type: 'music.volume',
        idempotencyKey: `music.volume:${message.id}`,
        createdAt: new Date(),
        guildId: metadata.guildId,
        textChannelId: metadata.textChannelId,
        voiceChannelId,
        requester: metadata.requester,
        source: metadata.source,
        locale: metadata.locale,
        level,
      };

      try {
        const entryId = await context.enqueueJob(job);
        context.logger.info(
          {
            jobId: job.id,
            entryId,
            guildId: job.guildId,
            voiceChannelId: job.voiceChannelId,
            level: job.level ?? null,
          },
          'Enqueued music.volume job (prefix)',
        );
        await message.reply(
          level !== undefined ? `Setting volume to ${level}%.` : 'Retrieving the current volume...',
        );
      } catch (error) {
        const schedulerMessage = resolveSchedulerErrorMessage(error);
        if (schedulerMessage) {
          await message.reply(schedulerMessage);
          return;
        }
        context.logger.error(
          { err: error, guildId: job.guildId, voiceChannelId: job.voiceChannelId, jobId: job.id },
          'Failed to enqueue music.volume job from prefix command',
        );
        await message.reply('Unable to process your volume request right now. Please try again later.');
      }
    },
  };
}
