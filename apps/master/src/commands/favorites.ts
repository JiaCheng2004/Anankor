import { SlashCommandBuilder } from 'discord.js';
import { generateJobId } from '@anankor/ipc';
import type { MusicFavoriteAddJob, MusicFavoritePlayJob } from '@anankor/schemas';
import type { ChatInputCommand } from './types.js';
import {
  buildInteractionMetadata,
  buildMessageMetadata,
  getVoiceChannelIdFromInteraction,
  getVoiceChannelIdFromMessage,
  replyToInteraction,
} from './utils.js';

const COMMAND_NAME = 'fav';

const FAVORITE_PREFIX_MAP: Record<string, 'add' | 'play'> = {
  favadd: 'add',
  fa: 'add',
  save: 'add',
  heart: 'add',
  '❤️': 'add',
  favplay: 'play',
  fp: 'play',
  fav: 'play',
  myfav: 'play',
  favorite: 'play',
};

export function createFavoritesCommand(): ChatInputCommand {
  return {
    data: new SlashCommandBuilder()
      .setName(COMMAND_NAME)
      .setDescription('Manage your music favourites.')
      .addSubcommand((subcommand) =>
        subcommand
          .setName('add')
          .setDescription('Save the current or most recent track to your favourites.'),
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('play')
          .setDescription('Queue a track from your favourites.')
          .addStringOption((option) =>
            option
              .setName('name')
              .setDescription('Optional favourite name to play (defaults to most recent).')
              .setRequired(false),
          ),
      ),
    prefixNames: Object.keys(FAVORITE_PREFIX_MAP),
    async execute(interaction, context) {
      const subcommand = interaction.options.getSubcommand();
      const metadata = buildInteractionMetadata(interaction);
      if (!metadata) {
        await replyToInteraction(interaction, 'This command can only be used inside a Discord server.');
        return;
      }

      if (subcommand === 'add') {
        const job: MusicFavoriteAddJob = {
          id: generateJobId(),
          type: 'music.favorite.add',
          idempotencyKey: `music.favorite.add:${interaction.id}`,
          createdAt: new Date(),
          guildId: metadata.guildId,
          textChannelId: metadata.textChannelId,
          requester: metadata.requester,
          source: metadata.source,
          locale: metadata.locale,
          voiceChannelId: getVoiceChannelIdFromInteraction(interaction) ?? undefined,
        };

        try {
          const entryId = await context.enqueueJob(job);
          context.logger.info(
            { jobId: job.id, entryId, guildId: job.guildId, voiceChannelId: job.voiceChannelId ?? null },
            'Enqueued music.favorite.add job',
          );
          await replyToInteraction(interaction, 'Saving this track to your favourites if possible.');
        } catch (error) {
          context.logger.error({ err: error, guildId: job.guildId, jobId: job.id }, 'Failed to enqueue music.favorite.add');
          await replyToInteraction(interaction, 'Unable to save favourites right now. Please try again later.');
        }
        return;
      }

      const voiceChannelId = getVoiceChannelIdFromInteraction(interaction);
      if (!voiceChannelId) {
        await replyToInteraction(interaction, 'Join a voice channel before playing from your favourites.');
        return;
      }

      const favouriteName = interaction.options.getString('name') ?? undefined;
      const job: MusicFavoritePlayJob = {
        id: generateJobId(),
        type: 'music.favorite.play',
        idempotencyKey: `music.favorite.play:${interaction.id}`,
        createdAt: new Date(),
        guildId: metadata.guildId,
        textChannelId: metadata.textChannelId,
        requester: metadata.requester,
        source: metadata.source,
        locale: metadata.locale,
        voiceChannelId,
        name: favouriteName,
      };

      try {
        const entryId = await context.enqueueJob(job);
        context.logger.info(
          { jobId: job.id, entryId, guildId: job.guildId, voiceChannelId: job.voiceChannelId, favouriteName },
          'Enqueued music.favorite.play job',
        );
        await replyToInteraction(interaction, favouriteName ? `Queuing favourite **${favouriteName}**.` : 'Queuing your most recent favourite.');
      } catch (error) {
        context.logger.error({ err: error, guildId: job.guildId, jobId: job.id }, 'Failed to enqueue music.favorite.play');
        await replyToInteraction(interaction, 'Unable to play favourites right now. Please try again later.');
      }
    },
    async executePrefix(message, args, context, alias) {
      const mode = FAVORITE_PREFIX_MAP[alias];
      if (!mode) {
        await message.reply('Unknown favourites action.');
        return;
      }

      const metadata = buildMessageMetadata(message);
      if (!metadata) {
        await message.reply('This command can only be used inside a Discord server.');
        return;
      }

      if (mode === 'add') {
        const job: MusicFavoriteAddJob = {
          id: generateJobId(),
          type: 'music.favorite.add',
          idempotencyKey: `music.favorite.add:${message.id}`,
          createdAt: new Date(),
          guildId: metadata.guildId,
          textChannelId: metadata.textChannelId,
          requester: metadata.requester,
          source: metadata.source,
          locale: metadata.locale,
          voiceChannelId: getVoiceChannelIdFromMessage(message) ?? undefined,
        };

        try {
          const entryId = await context.enqueueJob(job);
          context.logger.info(
            { jobId: job.id, entryId, guildId: job.guildId, voiceChannelId: job.voiceChannelId ?? null },
            'Enqueued music.favorite.add job (prefix)',
          );
          await message.reply('Saving this track to your favourites if possible.');
        } catch (error) {
          context.logger.error({ err: error, guildId: job.guildId, jobId: job.id }, 'Failed to enqueue music.favorite.add');
          await message.reply('Unable to save favourites right now. Please try again later.');
        }
        return;
      }

      const voiceChannelId = getVoiceChannelIdFromMessage(message);
      if (!voiceChannelId) {
        await message.reply('Join a voice channel before playing from your favourites.');
        return;
      }

      const favouriteName = args.join(' ').trim() || undefined;
      const job: MusicFavoritePlayJob = {
        id: generateJobId(),
        type: 'music.favorite.play',
        idempotencyKey: `music.favorite.play:${message.id}`,
        createdAt: new Date(),
        guildId: metadata.guildId,
        textChannelId: metadata.textChannelId,
        requester: metadata.requester,
        source: metadata.source,
        locale: metadata.locale,
        voiceChannelId,
        name: favouriteName,
      };

      try {
        const entryId = await context.enqueueJob(job);
        context.logger.info(
          { jobId: job.id, entryId, guildId: job.guildId, voiceChannelId: job.voiceChannelId, favouriteName },
          'Enqueued music.favorite.play job (prefix)',
        );
        await message.reply(
          favouriteName ? `Queuing favourite **${favouriteName}**.` : 'Queuing your most recent favourite.',
        );
      } catch (error) {
        context.logger.error({ err: error, guildId: job.guildId, jobId: job.id }, 'Failed to enqueue music.favorite.play');
        await message.reply('Unable to play favourites right now. Please try again later.');
      }
    },
  };
}
