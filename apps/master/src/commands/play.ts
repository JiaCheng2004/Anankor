import { escapeMarkdown, SlashCommandBuilder } from 'discord.js';
import { generateJobId } from '@anankor/ipc';
import type { MusicPlayJob } from '@anankor/schemas';
import type { ChatInputCommand } from './types.js';
import {
  buildInteractionMetadata,
  buildMessageMetadata,
  getVoiceChannelIdFromInteraction,
  getVoiceChannelIdFromMessage,
  replyToInteraction,
} from './utils.js';

const COMMAND_NAME = 'play';

const PLAY_PREFIX_ALIASES = ['play', 'p', 'song', 'add', 'queueadd', 'request'];

export function createPlayCommand(): ChatInputCommand {
  return {
    data: new SlashCommandBuilder()
      .setName(COMMAND_NAME)
      .setDescription('Play a track or enqueue it if something is already playing.')
      .addStringOption((option) =>
        option.setName('query').setDescription('Search query or URL for the track to play.').setRequired(true),
      ),
    prefixNames: PLAY_PREFIX_ALIASES,
    async execute(interaction, context) {
      const metadata = buildInteractionMetadata(interaction);
      if (!metadata) {
        await replyToInteraction(interaction, 'This command can only be used inside a Discord server.');
        return;
      }

      const voiceChannelId = getVoiceChannelIdFromInteraction(interaction);
      if (!voiceChannelId) {
        await replyToInteraction(interaction, 'You need to join a voice channel before requesting music.');
        return;
      }

      const query = interaction.options.getString('query', true).trim();
      if (query.length === 0) {
        await replyToInteraction(interaction, 'Please provide a search query or track URL.');
        return;
      }

      const job: MusicPlayJob = {
        id: generateJobId(),
        type: 'music.play',
        idempotencyKey: `music.play:${interaction.id}`,
        createdAt: new Date(),
        guildId: metadata.guildId,
        textChannelId: metadata.textChannelId,
        voiceChannelId,
        requester: metadata.requester,
        source: metadata.source,
        locale: metadata.locale,
        query,
      };

      try {
        const entryId = await context.enqueueJob(job);
        context.logger.info(
          {
            jobId: job.id,
            entryId,
            guildId: job.guildId,
            textChannelId: job.textChannelId,
            voiceChannelId: job.voiceChannelId,
            requesterId: job.requester.userId,
          },
          'Enqueued music.play job',
        );
        await replyToInteraction(interaction, `Queued **${escapeMarkdown(query)}** for playback.`);
      } catch (error) {
        context.logger.error(
          { err: error, guildId: job.guildId, voiceChannelId: job.voiceChannelId, jobId: job.id },
          'Failed to enqueue music.play job',
        );
        await replyToInteraction(interaction, 'Unable to queue that track right now. Please try again shortly.');
      }
    },
    async executePrefix(message, args, context) {
      const metadata = buildMessageMetadata(message);
      if (!metadata) {
        await message.reply('This command can only be used inside a Discord server.');
        return;
      }

      const voiceChannelId = getVoiceChannelIdFromMessage(message);
      if (!voiceChannelId) {
        await message.reply('You need to join a voice channel before requesting music.');
        return;
      }

      const query = args.join(' ').trim();
      if (query.length === 0) {
        await message.reply('Please provide a search query or track URL.');
        return;
      }

      const job: MusicPlayJob = {
        id: generateJobId(),
        type: 'music.play',
        idempotencyKey: `music.play:${message.id}`,
        createdAt: new Date(),
        guildId: metadata.guildId,
        textChannelId: metadata.textChannelId,
        voiceChannelId,
        requester: metadata.requester,
        source: metadata.source,
        locale: metadata.locale,
        query,
      };

      try {
        const entryId = await context.enqueueJob(job);
        context.logger.info(
          {
            jobId: job.id,
            entryId,
            guildId: job.guildId,
            textChannelId: job.textChannelId,
            voiceChannelId: job.voiceChannelId,
            requesterId: job.requester.userId,
          },
          'Enqueued music.play job (prefix)',
        );
        await message.reply(`Queued **${escapeMarkdown(query)}** for playback.`);
      } catch (error) {
        context.logger.error(
          { err: error, guildId: job.guildId, voiceChannelId: job.voiceChannelId, jobId: job.id },
          'Failed to enqueue music.play job from prefix command',
        );
        await message.reply('Unable to queue that track right now. Please try again shortly.');
      }
    },
  };
}
