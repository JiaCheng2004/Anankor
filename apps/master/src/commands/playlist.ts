import { SlashCommandBuilder } from 'discord.js';
import { generateJobId } from '@anankor/ipc';
import type {
  MusicPlaylistAddJob,
  MusicPlaylistCreateJob,
  MusicPlaylistListJob,
  MusicPlaylistPlayJob,
} from '@anankor/schemas';
import type { ChatInputCommand } from './types.js';
import {
  buildInteractionMetadata,
  buildMessageMetadata,
  getVoiceChannelIdFromInteraction,
  getVoiceChannelIdFromMessage,
  replyToInteraction,
  type CommandJobMetadata,
} from './utils.js';

const COMMAND_NAME = 'playlist';

const PLAYLIST_PREFIX_MAP: Record<string, 'create' | 'add' | 'list' | 'play'> = {
  plcreate: 'create',
  plnew: 'create',
  mkpl: 'create',
  playlistnew: 'create',
  pladd: 'add',
  pla: 'add',
  '2pl': 'add',
  playlistadd: 'add',
  pllist: 'list',
  pll: 'list',
  mypl: 'list',
  playlistlist: 'list',
  plplay: 'play',
  plp: 'play',
  mix: 'play',
  playlist: 'play',
};

type PlaylistCommandMode = (typeof PLAYLIST_PREFIX_MAP)[keyof typeof PLAYLIST_PREFIX_MAP];

export function createPlaylistCommand(): ChatInputCommand {
  return {
    data: new SlashCommandBuilder()
      .setName(COMMAND_NAME)
      .setDescription('Create and manage music playlists.')
      .addSubcommand((subcommand) =>
        subcommand
          .setName('create')
          .setDescription('Create a new playlist.')
          .addStringOption((option) =>
            option.setName('name').setDescription('Name of the playlist.').setRequired(true),
          )
          .addStringOption((option) =>
            option
              .setName('visibility')
              .setDescription('Who can access this playlist (defaults to personal).')
              .addChoices(
                { name: 'Personal', value: 'personal' },
                { name: 'Guild', value: 'guild' },
              )
              .setRequired(false),
          ),
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('add')
          .setDescription('Add the current track or a query result to a playlist.')
          .addStringOption((option) =>
            option.setName('name').setDescription('Target playlist name.').setRequired(true),
          )
          .addStringOption((option) =>
            option
              .setName('song')
              .setDescription('Optional search query or URL to add (defaults to current track).')
              .setRequired(false),
          ),
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('list')
          .setDescription('List your playlists or entries in a specific playlist.')
          .addStringOption((option) =>
            option
              .setName('name')
              .setDescription('Optional playlist name to inspect.')
              .setRequired(false),
          ),
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('play')
          .setDescription('Queue the contents of a playlist.')
          .addStringOption((option) =>
            option.setName('name').setDescription('Name of the playlist to queue.').setRequired(true),
          ),
      ),
    prefixNames: Object.keys(PLAYLIST_PREFIX_MAP),
    async execute(interaction, context) {
      const metadata = buildInteractionMetadata(interaction);
      if (!metadata) {
        await replyToInteraction(interaction, 'This command can only be used inside a Discord server.');
        return;
      }

      const subcommand = interaction.options.getSubcommand();

      switch (subcommand) {
        case 'create':
          await handleCreate({
            name: interaction.options.getString('name', true),
            visibility: (interaction.options.getString('visibility') as MusicPlaylistCreateJob['visibility']) ?? 'personal',
            context,
            metadata,
            idempotencyKey: interaction.id,
            acknowledge: (message) => replyToInteraction(interaction, message),
          });
          return;
        case 'add':
          await handleAdd({
            name: interaction.options.getString('name', true),
            query: interaction.options.getString('song') ?? undefined,
            voiceChannelId: getVoiceChannelIdFromInteraction(interaction) ?? undefined,
            context,
            metadata,
            idempotencyKey: interaction.id,
            acknowledge: (message) => replyToInteraction(interaction, message),
          });
          return;
        case 'list':
          await handleList({
            name: interaction.options.getString('name') ?? undefined,
            context,
            metadata,
            idempotencyKey: interaction.id,
            acknowledge: (message) => replyToInteraction(interaction, message),
          });
          return;
        case 'play':
          await handlePlay({
            name: interaction.options.getString('name', true),
            voiceChannelId: getVoiceChannelIdFromInteraction(interaction),
            context,
            metadata,
            idempotencyKey: interaction.id,
            acknowledge: (message) => replyToInteraction(interaction, message),
          });
          return;
        default:
          await replyToInteraction(interaction, 'Unsupported playlist action.');
      }
    },
    async executePrefix(message, args, context, alias) {
      const mode = PLAYLIST_PREFIX_MAP[alias];
      if (!mode) {
        await message.reply('Unknown playlist action.');
        return;
      }

      const metadata = buildMessageMetadata(message);
      if (!metadata) {
        await message.reply('This command can only be used inside a Discord server.');
        return;
      }

      switch (mode) {
        case 'create': {
          const { name } = consumeName(args);
          if (!name) {
            await message.reply('Please provide a playlist name.');
            return;
          }
          await handleCreate({
            name,
            visibility: 'personal',
            context,
            metadata,
            idempotencyKey: message.id,
            acknowledge: (msg) => message.reply(msg),
          });
          break;
        }
        case 'add': {
          const { name, rest } = consumeName(args);
          if (!name) {
            await message.reply('Please provide a playlist name.');
            return;
          }
          const query = rest.join(' ').trim() || undefined;
          await handleAdd({
            name,
            query,
            voiceChannelId: getVoiceChannelIdFromMessage(message) ?? undefined,
            context,
            metadata,
            idempotencyKey: message.id,
            acknowledge: (msg) => message.reply(msg),
          });
          break;
        }
        case 'list': {
          const { name } = consumeName(args);
          await handleList({
            name: name ?? undefined,
            context,
            metadata,
            idempotencyKey: message.id,
            acknowledge: (msg) => message.reply(msg),
          });
          break;
        }
        case 'play': {
          const { name, rest } = consumeName(args);
          if (!name) {
            await message.reply('Please provide a playlist name.');
            return;
          }
          const voiceChannelId = getVoiceChannelIdFromMessage(message);
          if (!voiceChannelId) {
            await message.reply('Join a voice channel before queueing a playlist.');
            return;
          }

          if (rest.length > 0) {
            await message.reply('Extra arguments ignored when playing a playlist.');
          }

          await handlePlay({
            name,
            voiceChannelId,
            context,
            metadata,
            idempotencyKey: message.id,
            acknowledge: (msg) => message.reply(msg),
          });
          break;
        }
      }
    },
  };
}

interface PlaylistCommandBaseParams {
  metadata: CommandJobMetadata;
  context: Parameters<ChatInputCommand['execute']>[1];
  idempotencyKey: string;
  acknowledge: (message: string) => Promise<unknown> | void;
}

interface CreateParams extends PlaylistCommandBaseParams {
  name: string;
  visibility: MusicPlaylistCreateJob['visibility'];
}

async function handleCreate(params: CreateParams): Promise<void> {
  const { name, visibility, metadata, context, idempotencyKey, acknowledge } = params;

  const job: MusicPlaylistCreateJob = {
    id: generateJobId(),
    type: 'music.playlist.create',
    idempotencyKey: `music.playlist.create:${idempotencyKey}`,
    createdAt: new Date(),
    guildId: metadata.guildId,
    textChannelId: metadata.textChannelId,
    requester: metadata.requester,
    source: metadata.source,
    locale: metadata.locale,
    name,
    visibility,
  };

  try {
    const entryId = await context.enqueueJob(job);
    context.logger.info(
      { jobId: job.id, entryId, guildId: job.guildId, name: job.name, visibility: job.visibility },
      'Enqueued music.playlist.create job',
    );
    await acknowledge(`Creating playlist **${name}** (${visibility}).`);
  } catch (error) {
    context.logger.error({ err: error, guildId: job.guildId, jobId: job.id }, 'Failed to enqueue playlist.create');
    await acknowledge('Unable to create that playlist at the moment.');
  }
}

interface AddParams extends PlaylistCommandBaseParams {
  name: string;
  query?: string;
  voiceChannelId?: string;
}

async function handleAdd(params: AddParams): Promise<void> {
  const { name, query, voiceChannelId, metadata, context, idempotencyKey, acknowledge } = params;

  const job: MusicPlaylistAddJob = {
    id: generateJobId(),
    type: 'music.playlist.add',
    idempotencyKey: `music.playlist.add:${idempotencyKey}`,
    createdAt: new Date(),
    guildId: metadata.guildId,
    textChannelId: metadata.textChannelId,
    requester: metadata.requester,
    source: metadata.source,
    locale: metadata.locale,
    name,
    voiceChannelId,
    query,
  };

  try {
    const entryId = await context.enqueueJob(job);
    context.logger.info(
      { jobId: job.id, entryId, guildId: job.guildId, name: job.name, hasQuery: Boolean(job.query) },
      'Enqueued music.playlist.add job',
    );
    await acknowledge(
      query ? `Adding **${query}** to playlist **${name}**.` : `Saving the current track to playlist **${name}**.`,
    );
  } catch (error) {
    context.logger.error({ err: error, guildId: job.guildId, jobId: job.id }, 'Failed to enqueue playlist.add');
    await acknowledge('Unable to update that playlist right now.');
  }
}

interface ListParams extends PlaylistCommandBaseParams {
  name?: string;
}

async function handleList(params: ListParams): Promise<void> {
  const { name, metadata, context, idempotencyKey, acknowledge } = params;

  const job: MusicPlaylistListJob = {
    id: generateJobId(),
    type: 'music.playlist.list',
    idempotencyKey: `music.playlist.list:${idempotencyKey}`,
    createdAt: new Date(),
    guildId: metadata.guildId,
    textChannelId: metadata.textChannelId,
    requester: metadata.requester,
    source: metadata.source,
    locale: metadata.locale,
    name,
  };

  try {
    const entryId = await context.enqueueJob(job);
    context.logger.info(
      { jobId: job.id, entryId, guildId: job.guildId, name: job.name ?? null },
      'Enqueued music.playlist.list job',
    );
    await acknowledge(name ? `Fetching playlist **${name}**.` : 'Fetching your playlists.');
  } catch (error) {
    context.logger.error({ err: error, guildId: job.guildId, jobId: job.id }, 'Failed to enqueue playlist.list');
    await acknowledge('Unable to fetch playlists right now.');
  }
}

interface PlayParams extends PlaylistCommandBaseParams {
  name: string;
  voiceChannelId: string | null;
}

async function handlePlay(params: PlayParams): Promise<void> {
  const { name, voiceChannelId, metadata, context, idempotencyKey, acknowledge } = params;

  if (!voiceChannelId) {
    await acknowledge('Join a voice channel before queueing a playlist.');
    return;
  }

  const job: MusicPlaylistPlayJob = {
    id: generateJobId(),
    type: 'music.playlist.play',
    idempotencyKey: `music.playlist.play:${idempotencyKey}`,
    createdAt: new Date(),
    guildId: metadata.guildId,
    textChannelId: metadata.textChannelId,
    requester: metadata.requester,
    source: metadata.source,
    locale: metadata.locale,
    name,
    voiceChannelId,
  };

  try {
    const entryId = await context.enqueueJob(job);
    context.logger.info(
      { jobId: job.id, entryId, guildId: job.guildId, name: job.name, voiceChannelId: job.voiceChannelId },
      'Enqueued music.playlist.play job',
    );
    await acknowledge(`Queuing playlist **${name}**.`);
  } catch (error) {
    context.logger.error({ err: error, guildId: job.guildId, jobId: job.id }, 'Failed to enqueue playlist.play');
    await acknowledge('Unable to play that playlist right now.');
  }
}

function consumeName(args: string[]): { name: string | null; rest: string[] } {
  if (args.length === 0) {
    return { name: null, rest: [] };
  }

  const [first, ...initialRest] = args;

  if (first.startsWith('"')) {
    let collected = first;
    let endIndex = 0;
    for (let i = 0; i < initialRest.length; i += 1) {
      collected += ` ${initialRest[i]}`;
      if (initialRest[i].endsWith('"')) {
        endIndex = i + 1;
        break;
      }
    }
    if (collected.endsWith('"')) {
      const name = collected.slice(1, -1).trim();
      const rest = initialRest.slice(endIndex);
      return { name, rest };
    }
  }

  return { name: first, rest: initialRest };
}
