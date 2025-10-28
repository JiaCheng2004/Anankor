import { SlashCommandBuilder } from 'discord.js';
import { generateJobId } from '@anankor/ipc';
import type { RadioGenreListJob, RadioStartJob, RadioStopJob } from '@anankor/schemas';
import type { ChatInputCommand } from './types.js';
import {
  buildInteractionMetadata,
  buildMessageMetadata,
  getVoiceChannelIdFromInteraction,
  getVoiceChannelIdFromMessage,
  replyToInteraction,
  type CommandJobMetadata,
} from './utils.js';

const COMMAND_NAME = 'radio';

const RADIO_PREFIX_MAP: Record<string, 'start' | 'stop' | 'genres'> = {
  radio: 'start',
  ra: 'start',
  fm: 'start',
  station: 'start',
  autoplay: 'start',
  radiostop: 'stop',
  stopradio: 'stop',
  rfmoff: 'stop',
  stationoff: 'stop',
  endradio: 'stop',
  radiogenres: 'genres',
  genres: 'genres',
  fmgenres: 'genres',
  stations: 'genres',
  radiolist: 'genres',
};

export function createRadioCommand(): ChatInputCommand {
  return {
    data: new SlashCommandBuilder()
      .setName(COMMAND_NAME)
      .setDescription('Control the continuous radio mode.')
      .addSubcommand((subcommand) =>
        subcommand
          .setName('start')
          .setDescription('Start a radio station in this guild.')
          .addStringOption((option) =>
            option.setName('genre').setDescription('Genre to play (use /radio genre list for options).').setRequired(true),
          ),
      )
      .addSubcommand((subcommand) => subcommand.setName('stop').setDescription('Stop the radio mode.'))
      .addSubcommandGroup((group) =>
        group
          .setName('genre')
          .setDescription('Manage available radio genres.')
          .addSubcommand((subcommand) =>
            subcommand.setName('list').setDescription('List available radio genres.'),
          ),
      ),
    prefixNames: Object.keys(RADIO_PREFIX_MAP),
    async execute(interaction, context) {
      const metadata = buildInteractionMetadata(interaction);
      if (!metadata) {
        await replyToInteraction(interaction, 'This command can only be used inside a Discord server.');
        return;
      }

      if (interaction.options.getSubcommandGroup(false) === 'genre') {
        await handleGenreList({
          metadata,
          context,
          idempotencyKey: interaction.id,
          acknowledge: (msg) => replyToInteraction(interaction, msg),
        });
        return;
      }

      const subcommand = interaction.options.getSubcommand();
      if (subcommand === 'start') {
        const voiceChannelId = getVoiceChannelIdFromInteraction(interaction);
        if (!voiceChannelId) {
          await replyToInteraction(interaction, 'Join a voice channel before starting the radio.');
          return;
        }

        await handleStart({
          genre: interaction.options.getString('genre', true),
          voiceChannelId,
          metadata,
          context,
          idempotencyKey: interaction.id,
          acknowledge: (msg) => replyToInteraction(interaction, msg),
        });
        return;
      }

      if (subcommand === 'stop') {
        const voiceChannelId = getVoiceChannelIdFromInteraction(interaction);
        if (!voiceChannelId) {
          await replyToInteraction(interaction, 'Join a voice channel before stopping the radio.');
          return;
        }

        await handleStop({
          voiceChannelId,
          metadata,
          context,
          idempotencyKey: interaction.id,
          acknowledge: (msg) => replyToInteraction(interaction, msg),
        });
        return;
      }

      await replyToInteraction(interaction, 'Unsupported radio action.');
    },
    async executePrefix(message, args, context, alias) {
      const action = RADIO_PREFIX_MAP[alias];
      if (!action) {
        await message.reply('Unknown radio action.');
        return;
      }

      const metadata = buildMessageMetadata(message);
      if (!metadata) {
        await message.reply('This command can only be used inside a Discord server.');
        return;
      }

      switch (action) {
        case 'start': {
          if (args.length === 0) {
            await message.reply('Please provide a radio genre.');
            return;
          }
          const voiceChannelId = getVoiceChannelIdFromMessage(message);
          if (!voiceChannelId) {
            await message.reply('Join a voice channel before starting the radio.');
            return;
          }
          const genre = args.join(' ');
          await handleStart({
            genre,
            voiceChannelId,
            metadata,
            context,
            idempotencyKey: message.id,
            acknowledge: (msg) => message.reply(msg),
          });
          break;
        }
        case 'stop': {
          const voiceChannelId = getVoiceChannelIdFromMessage(message);
          if (!voiceChannelId) {
            await message.reply('Join a voice channel before stopping the radio.');
            return;
          }
          await handleStop({
            voiceChannelId,
            metadata,
            context,
            idempotencyKey: message.id,
            acknowledge: (msg) => message.reply(msg),
          });
          break;
        }
        case 'genres': {
          await handleGenreList({
            metadata,
            context,
            idempotencyKey: message.id,
            acknowledge: (msg) => message.reply(msg),
          });
          break;
        }
      }
    },
  };
}

interface BaseRadioParams {
  metadata: CommandJobMetadata;
  context: Parameters<ChatInputCommand['execute']>[1];
  idempotencyKey: string;
  acknowledge: (message: string) => Promise<unknown> | void;
}

interface StartParams extends BaseRadioParams {
  genre: string;
  voiceChannelId: string;
}

async function handleStart(params: StartParams): Promise<void> {
  const { genre, voiceChannelId, metadata, context, idempotencyKey, acknowledge } = params;

  const job: RadioStartJob = {
    id: generateJobId(),
    type: 'radio.start',
    idempotencyKey: `radio.start:${idempotencyKey}`,
    createdAt: new Date(),
    guildId: metadata.guildId,
    textChannelId: metadata.textChannelId,
    requester: metadata.requester,
    source: metadata.source,
    locale: metadata.locale,
    voiceChannelId,
    genre,
  };

  try {
    const entryId = await context.enqueueJob(job);
    context.logger.info(
      { jobId: job.id, entryId, guildId: job.guildId, voiceChannelId: job.voiceChannelId, genre: job.genre },
      'Enqueued radio.start job',
    );
    await acknowledge(`Starting radio for **${genre}**.`);
  } catch (error) {
    context.logger.error({ err: error, guildId: job.guildId, jobId: job.id }, 'Failed to enqueue radio.start job');
    await acknowledge('Unable to start radio right now.');
  }
}

interface StopParams extends BaseRadioParams {
  voiceChannelId: string;
}

async function handleStop(params: StopParams): Promise<void> {
  const { voiceChannelId, metadata, context, idempotencyKey, acknowledge } = params;

  const job: RadioStopJob = {
    id: generateJobId(),
    type: 'radio.stop',
    idempotencyKey: `radio.stop:${idempotencyKey}`,
    createdAt: new Date(),
    guildId: metadata.guildId,
    textChannelId: metadata.textChannelId,
    requester: metadata.requester,
    source: metadata.source,
    locale: metadata.locale,
    voiceChannelId,
  };

  try {
    const entryId = await context.enqueueJob(job);
    context.logger.info(
      { jobId: job.id, entryId, guildId: job.guildId, voiceChannelId: job.voiceChannelId },
      'Enqueued radio.stop job',
    );
    await acknowledge('Stopping radio mode.');
  } catch (error) {
    context.logger.error({ err: error, guildId: job.guildId, jobId: job.id }, 'Failed to enqueue radio.stop job');
    await acknowledge('Unable to stop radio right now.');
  }
}

interface GenreListParams extends BaseRadioParams {}

async function handleGenreList(params: GenreListParams): Promise<void> {
  const { metadata, context, idempotencyKey, acknowledge } = params;

  const job: RadioGenreListJob = {
    id: generateJobId(),
    type: 'radio.genre.list',
    idempotencyKey: `radio.genre.list:${idempotencyKey}`,
    createdAt: new Date(),
    guildId: metadata.guildId,
    textChannelId: metadata.textChannelId,
    requester: metadata.requester,
    source: metadata.source,
    locale: metadata.locale,
  };

  try {
    const entryId = await context.enqueueJob(job);
    context.logger.info(
      { jobId: job.id, entryId, guildId: job.guildId },
      'Enqueued radio.genre.list job',
    );
    await acknowledge('Fetching available radio genres.');
  } catch (error) {
    context.logger.error({ err: error, guildId: job.guildId, jobId: job.id }, 'Failed to enqueue radio.genre.list job');
    await acknowledge('Unable to fetch radio genres right now.');
  }
}
