import { SlashCommandBuilder } from 'discord.js';
import { generateJobId } from '@anankor/ipc';
import type {
  GameUndercoverStartJob,
  GameUndercoverVoteJob,
  GameUndercoverStatusJob,
} from '@anankor/schemas';
import type { ChatInputCommand } from './types.js';
import { buildInteractionMetadata, buildMessageMetadata, replyToInteraction, type CommandJobMetadata } from './utils.js';

const COMMAND_NAME = 'undercover';

const UNDERCOVER_PREFIX_MAP: Record<string, 'start' | 'vote' | 'status'> = {
  ucstart: 'start',
  undercover: 'start',
  spy: 'start',
  impostor: 'start',
  ucvote: 'vote',
  voteuc: 'vote',
  sus: 'vote',
  point: 'vote',
  ucstatus: 'status',
  statusuc: 'status',
  round: 'status',
  whoalive: 'status',
};

export function createUndercoverCommand(): ChatInputCommand {
  return {
    data: new SlashCommandBuilder()
      .setName(COMMAND_NAME)
      .setDescription('Manage Undercover / Spy party games.')
      .addSubcommand((subcommand) =>
        subcommand
          .setName('start')
          .setDescription('Start a new Undercover round.')
          .addStringOption((option) =>
            option
              .setName('wordset')
              .setDescription('Optional word set or theme to use.')
              .setRequired(false),
          ),
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('vote')
          .setDescription('Vote for who you suspect or view current votes.')
          .addStringOption((option) =>
            option
              .setName('target')
              .setDescription('User mention or name to vote for (leave blank to view votes).')
              .setRequired(false),
          ),
      )
      .addSubcommand((subcommand) => subcommand.setName('status').setDescription('View the current Undercover status.')),
    prefixNames: Object.keys(UNDERCOVER_PREFIX_MAP),
    async execute(interaction, context) {
      const metadata = buildInteractionMetadata(interaction);
      if (!metadata) {
        await replyToInteraction(interaction, 'This command can only be used inside a Discord server.');
        return;
      }

      const subcommand = interaction.options.getSubcommand();
      switch (subcommand) {
        case 'start':
          await handleStart({
            wordSet: interaction.options.getString('wordset') ?? undefined,
            metadata,
            context,
            idempotencyKey: interaction.id,
            acknowledge: (msg) => replyToInteraction(interaction, msg),
          });
          return;
        case 'vote':
          await handleVote({
            target: interaction.options.getString('target') ?? undefined,
            metadata,
            context,
            idempotencyKey: interaction.id,
            acknowledge: (msg) => replyToInteraction(interaction, msg),
          });
          return;
        case 'status':
          await handleStatus({
            metadata,
            context,
            idempotencyKey: interaction.id,
            acknowledge: (msg) => replyToInteraction(interaction, msg),
          });
          return;
        default:
          await replyToInteraction(interaction, 'Unsupported Undercover action.');
      }
    },
    async executePrefix(message, args, context, alias) {
      const action = UNDERCOVER_PREFIX_MAP[alias];
      if (!action) {
        await message.reply('Unknown Undercover action.');
        return;
      }

      const metadata = buildMessageMetadata(message);
      if (!metadata) {
        await message.reply('This command can only be used inside a Discord server.');
        return;
      }

      const payload = args.join(' ').trim() || undefined;

      switch (action) {
        case 'start':
          await handleStart({
            wordSet: payload,
            metadata,
            context,
            idempotencyKey: message.id,
            acknowledge: (msg) => message.reply(msg),
          });
          break;
        case 'vote':
          await handleVote({
            target: payload,
            metadata,
            context,
            idempotencyKey: message.id,
            acknowledge: (msg) => message.reply(msg),
          });
          break;
        case 'status':
          await handleStatus({
            metadata,
            context,
            idempotencyKey: message.id,
            acknowledge: (msg) => message.reply(msg),
          });
          break;
      }
    },
  };
}

interface BaseParams {
  metadata: CommandJobMetadata;
  context: Parameters<ChatInputCommand['execute']>[1];
  idempotencyKey: string;
  acknowledge: (message: string) => Promise<unknown> | void;
}

interface StartParams extends BaseParams {
  wordSet?: string;
}

async function handleStart(params: StartParams): Promise<void> {
  const { wordSet, metadata, context, idempotencyKey, acknowledge } = params;

  const job: GameUndercoverStartJob = {
    id: generateJobId(),
    type: 'game.undercover.start',
    idempotencyKey: `game.undercover.start:${idempotencyKey}`,
    createdAt: new Date(),
    guildId: metadata.guildId,
    textChannelId: metadata.textChannelId,
    requester: metadata.requester,
    source: metadata.source,
    locale: metadata.locale,
    wordSet,
  };

  try {
    const entryId = await context.enqueueJob(job);
    context.logger.info({ jobId: job.id, entryId, guildId: job.guildId, wordSet: job.wordSet ?? null }, 'Enqueued game.undercover.start');
    await acknowledge('Starting an Undercover round.');
  } catch (error) {
    context.logger.error({ err: error, guildId: job.guildId, jobId: job.id }, 'Failed to enqueue undercover.start');
    await acknowledge('Unable to start Undercover right now.');
  }
}

interface VoteParams extends BaseParams {
  target?: string;
}

async function handleVote(params: VoteParams): Promise<void> {
  const { target, metadata, context, idempotencyKey, acknowledge } = params;

  const job: GameUndercoverVoteJob = {
    id: generateJobId(),
    type: 'game.undercover.vote',
    idempotencyKey: `game.undercover.vote:${idempotencyKey}`,
    createdAt: new Date(),
    guildId: metadata.guildId,
    textChannelId: metadata.textChannelId,
    requester: metadata.requester,
    source: metadata.source,
    locale: metadata.locale,
    targetName: target,
  };

  try {
    const entryId = await context.enqueueJob(job);
    context.logger.info({ jobId: job.id, entryId, guildId: job.guildId, target: job.targetName ?? null }, 'Enqueued game.undercover.vote');
    await acknowledge(target ? `Casting vote for **${target}**.` : 'Retrieving current votes.');
  } catch (error) {
    context.logger.error({ err: error, guildId: job.guildId, jobId: job.id }, 'Failed to enqueue undercover.vote');
    await acknowledge('Unable to process votes right now.');
  }
}

interface StatusParams extends BaseParams {}

async function handleStatus(params: StatusParams): Promise<void> {
  const { metadata, context, idempotencyKey, acknowledge } = params;

  const job: GameUndercoverStatusJob = {
    id: generateJobId(),
    type: 'game.undercover.status',
    idempotencyKey: `game.undercover.status:${idempotencyKey}`,
    createdAt: new Date(),
    guildId: metadata.guildId,
    textChannelId: metadata.textChannelId,
    requester: metadata.requester,
    source: metadata.source,
    locale: metadata.locale,
  };

  try {
    const entryId = await context.enqueueJob(job);
    context.logger.info({ jobId: job.id, entryId, guildId: job.guildId }, 'Enqueued game.undercover.status');
    await acknowledge('Fetching Undercover status.');
  } catch (error) {
    context.logger.error({ err: error, guildId: job.guildId, jobId: job.id }, 'Failed to enqueue undercover.status');
    await acknowledge('Unable to fetch Undercover status right now.');
  }
}
