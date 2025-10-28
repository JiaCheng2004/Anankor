import { SlashCommandBuilder } from 'discord.js';
import { generateJobId } from '@anankor/ipc';
import type { MusicSkipJob } from '@anankor/schemas';
import type { ChatInputCommand } from './types.js';
import {
  buildInteractionMetadata,
  buildMessageMetadata,
  getVoiceChannelIdFromInteraction,
  getVoiceChannelIdFromMessage,
  replyToInteraction,
} from './utils.js';

const COMMAND_NAME = 'skip';
const SKIP_PREFIX_ALIASES = ['skip', 's', 'next', 'fs'];

export function createSkipCommand(): ChatInputCommand {
  return {
    data: new SlashCommandBuilder()
      .setName(COMMAND_NAME)
      .setDescription('Skip the current track.')
      .addIntegerOption((option) =>
        option
          .setName('count')
          .setDescription('Number of tracks to skip (defaults to 1).')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(25),
      )
      .addBooleanOption((option) =>
        option
          .setName('force')
          .setDescription('Force skip without vote if you have the required permissions.'),
      ),
    prefixNames: SKIP_PREFIX_ALIASES,
    async execute(interaction, context) {
      const metadata = buildInteractionMetadata(interaction);
      if (!metadata) {
        await replyToInteraction(interaction, 'This command can only be used inside a Discord server.');
        return;
      }

      const voiceChannelId = getVoiceChannelIdFromInteraction(interaction);
      if (!voiceChannelId) {
        await replyToInteraction(interaction, 'You need to join a voice channel before controlling playback.');
        return;
      }

      const count = interaction.options.getInteger('count') ?? 1;
      const force = interaction.options.getBoolean('force') ?? false;

      const job: MusicSkipJob = {
        id: generateJobId(),
        type: 'music.skip',
        idempotencyKey: `music.skip:${interaction.id}`,
        createdAt: new Date(),
        guildId: metadata.guildId,
        textChannelId: metadata.textChannelId,
        voiceChannelId,
        requester: metadata.requester,
        source: metadata.source,
        locale: metadata.locale,
        count,
        force: force ? true : undefined,
      };

      try {
        const entryId = await context.enqueueJob(job);
        context.logger.info(
          {
            jobId: job.id,
            entryId,
            guildId: job.guildId,
            voiceChannelId: job.voiceChannelId,
            count: job.count ?? 1,
            force: job.force ?? false,
          },
          'Enqueued music.skip job',
        );
        await replyToInteraction(interaction, count > 1 ? `Skipping ${count} tracks.` : 'Skipping the current track.');
      } catch (error) {
        context.logger.error(
          { err: error, guildId: job.guildId, voiceChannelId: job.voiceChannelId, jobId: job.id },
          'Failed to enqueue music.skip job',
        );
        await replyToInteraction(interaction, 'Unable to skip right now. Please try again in a moment.');
      }
    },
    async executePrefix(message, args, context, alias) {
      const metadata = buildMessageMetadata(message);
      if (!metadata) {
        await message.reply('This command can only be used inside a Discord server.');
        return;
      }

      const voiceChannelId = getVoiceChannelIdFromMessage(message);
      if (!voiceChannelId) {
        await message.reply('You need to join a voice channel before controlling playback.');
        return;
      }

      const countArg = args[0];
      const parsedCount = countArg ? Number.parseInt(countArg, 10) : Number.NaN;
      const count = Number.isNaN(parsedCount) ? 1 : Math.max(1, Math.min(25, parsedCount));
      const force = alias === 'fs';

      const job: MusicSkipJob = {
        id: generateJobId(),
        type: 'music.skip',
        idempotencyKey: `music.skip:${message.id}`,
        createdAt: new Date(),
        guildId: metadata.guildId,
        textChannelId: metadata.textChannelId,
        voiceChannelId,
        requester: metadata.requester,
        source: metadata.source,
        locale: metadata.locale,
        count,
        force: force ? true : undefined,
      };

      try {
        const entryId = await context.enqueueJob(job);
        context.logger.info(
          {
            jobId: job.id,
            entryId,
            guildId: job.guildId,
            voiceChannelId: job.voiceChannelId,
            count: job.count ?? 1,
            force: job.force ?? false,
            prefixAlias: alias,
          },
          'Enqueued music.skip job (prefix)',
        );
        await message.reply(count > 1 ? `Skipping ${count} tracks.` : 'Skipping the current track.');
      } catch (error) {
        context.logger.error(
          { err: error, guildId: job.guildId, voiceChannelId: job.voiceChannelId, jobId: job.id },
          'Failed to enqueue music.skip job from prefix command',
        );
        await message.reply('Unable to skip right now. Please try again in a moment.');
      }
    },
  };
}
