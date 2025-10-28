import { SlashCommandBuilder } from 'discord.js';
import { generateJobId } from '@anankor/ipc';
import type {
  GameWerewolfSetupJob,
  GameWerewolfStartJob,
  GameWerewolfStatusJob,
  GameWerewolfVoteJob,
} from '@anankor/schemas';
import type { ChatInputCommand } from './types.js';
import { buildInteractionMetadata, buildMessageMetadata, replyToInteraction, type CommandJobMetadata } from './utils.js';

const COMMAND_NAME = 'werewolf';

const WEREWOLF_PREFIX_MAP: Record<string, 'setup' | 'start' | 'vote' | 'status'> = {
  wwsetup: 'setup',
  wwconfig: 'setup',
  lobby: 'setup',
  roleset: 'setup',
  wwstart: 'start',
  wwgo: 'start',
  startww: 'start',
  beginww: 'start',
  wwvote: 'vote',
  vote: 'vote',
  lynch: 'vote',
  accuse: 'vote',
  wwstatus: 'status',
  statusww: 'status',
  phase: 'status',
  alive: 'status',
};

export function createWerewolfCommand(): ChatInputCommand {
  return {
    data: new SlashCommandBuilder()
      .setName(COMMAND_NAME)
      .setDescription('Coordinate Werewolf/Mafia games.')
      .addSubcommand((subcommand) =>
        subcommand
          .setName('setup')
          .setDescription('Prepare the lobby with roles and player count.')
          .addStringOption((option) =>
            option.setName('preset').setDescription('Optional preset or theme name.').setRequired(false),
          )
          .addIntegerOption((option) =>
            option
              .setName('players')
              .setDescription('Expected number of players (for guidance).')
              .setRequired(false)
              .setMinValue(5)
              .setMaxValue(30),
          ),
      )
      .addSubcommand((subcommand) => subcommand.setName('start').setDescription('Start the prepared game.'))
      .addSubcommand((subcommand) =>
        subcommand
          .setName('vote')
          .setDescription('Cast or view votes.')
          .addStringOption((option) =>
            option
              .setName('target')
              .setDescription('User mention or name to vote for (leave blank to view votes).')
              .setRequired(false),
          ),
      )
      .addSubcommand((subcommand) => subcommand.setName('status').setDescription('View the current phase and alive players.')),
    prefixNames: Object.keys(WEREWOLF_PREFIX_MAP),
    async execute(interaction, context) {
      const metadata = buildInteractionMetadata(interaction);
      if (!metadata) {
        await replyToInteraction(interaction, 'This command can only be used inside a Discord server.');
        return;
      }

      const subcommand = interaction.options.getSubcommand();
      switch (subcommand) {
        case 'setup':
          await handleSetup({
            preset: interaction.options.getString('preset') ?? undefined,
            playerCount: interaction.options.getInteger('players') ?? undefined,
            metadata,
            context,
            idempotencyKey: interaction.id,
            acknowledge: (msg) => replyToInteraction(interaction, msg),
          });
          return;
        case 'start':
          await handleStart({
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
          await replyToInteraction(interaction, 'Unsupported Werewolf action.');
      }
    },
    async executePrefix(message, args, context, alias) {
      const action = WEREWOLF_PREFIX_MAP[alias];
      if (!action) {
        await message.reply('Unknown Werewolf action.');
        return;
      }

      const metadata = buildMessageMetadata(message);
      if (!metadata) {
        await message.reply('This command can only be used inside a Discord server.');
        return;
      }

      switch (action) {
        case 'setup': {
          const preset = args[0]?.startsWith('#') ? args[0].slice(1) : undefined;
          const maybeNumber = args.find((arg) => /^\d+$/.test(arg));
          const playerCount = maybeNumber ? Number.parseInt(maybeNumber, 10) : undefined;
          await handleSetup({
            preset,
            playerCount,
            metadata,
            context,
            idempotencyKey: message.id,
            acknowledge: (msg) => message.reply(msg),
          });
          break;
        }
        case 'start':
          await handleStart({
            metadata,
            context,
            idempotencyKey: message.id,
            acknowledge: (msg) => message.reply(msg),
          });
          break;
        case 'vote': {
          const target = args.join(' ').trim() || undefined;
          await handleVote({
            target,
            metadata,
            context,
            idempotencyKey: message.id,
            acknowledge: (msg) => message.reply(msg),
          });
          break;
        }
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

interface SetupParams extends BaseParams {
  preset?: string;
  playerCount?: number;
}

async function handleSetup(params: SetupParams): Promise<void> {
  const { preset, playerCount, metadata, context, idempotencyKey, acknowledge } = params;

  const job: GameWerewolfSetupJob = {
    id: generateJobId(),
    type: 'game.werewolf.setup',
    idempotencyKey: `game.werewolf.setup:${idempotencyKey}`,
    createdAt: new Date(),
    guildId: metadata.guildId,
    textChannelId: metadata.textChannelId,
    requester: metadata.requester,
    source: metadata.source,
    locale: metadata.locale,
    preset,
    playerCount,
  };

  try {
    const entryId = await context.enqueueJob(job);
    context.logger.info(
      { jobId: job.id, entryId, guildId: job.guildId, preset: job.preset ?? null, playerCount: job.playerCount ?? null },
      'Enqueued game.werewolf.setup',
    );
    await acknowledge('Preparing the Werewolf lobby.');
  } catch (error) {
    context.logger.error({ err: error, guildId: job.guildId, jobId: job.id }, 'Failed to enqueue werewolf.setup');
    await acknowledge('Unable to setup Werewolf right now.');
  }
}

interface StartParams extends BaseParams {}

async function handleStart(params: StartParams): Promise<void> {
  const { metadata, context, idempotencyKey, acknowledge } = params;

  const job: GameWerewolfStartJob = {
    id: generateJobId(),
    type: 'game.werewolf.start',
    idempotencyKey: `game.werewolf.start:${idempotencyKey}`,
    createdAt: new Date(),
    guildId: metadata.guildId,
    textChannelId: metadata.textChannelId,
    requester: metadata.requester,
    source: metadata.source,
    locale: metadata.locale,
  };

  try {
    const entryId = await context.enqueueJob(job);
    context.logger.info({ jobId: job.id, entryId, guildId: job.guildId }, 'Enqueued game.werewolf.start');
    await acknowledge('Starting the Werewolf match.');
  } catch (error) {
    context.logger.error({ err: error, guildId: job.guildId, jobId: job.id }, 'Failed to enqueue werewolf.start');
    await acknowledge('Unable to start Werewolf right now.');
  }
}

interface VoteParams extends BaseParams {
  target?: string;
}

async function handleVote(params: VoteParams): Promise<void> {
  const { target, metadata, context, idempotencyKey, acknowledge } = params;

  const job: GameWerewolfVoteJob = {
    id: generateJobId(),
    type: 'game.werewolf.vote',
    idempotencyKey: `game.werewolf.vote:${idempotencyKey}`,
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
    context.logger.info(
      { jobId: job.id, entryId, guildId: job.guildId, target: job.targetName ?? null },
      'Enqueued game.werewolf.vote',
    );
    await acknowledge(target ? `Casting vote for **${target}**.` : 'Retrieving current votes.');
  } catch (error) {
    context.logger.error({ err: error, guildId: job.guildId, jobId: job.id }, 'Failed to enqueue werewolf.vote');
    await acknowledge('Unable to process Werewolf votes right now.');
  }
}

interface StatusParams extends BaseParams {}

async function handleStatus(params: StatusParams): Promise<void> {
  const { metadata, context, idempotencyKey, acknowledge } = params;

  const job: GameWerewolfStatusJob = {
    id: generateJobId(),
    type: 'game.werewolf.status',
    idempotencyKey: `game.werewolf.status:${idempotencyKey}`,
    createdAt: new Date(),
    guildId: metadata.guildId,
    textChannelId: metadata.textChannelId,
    requester: metadata.requester,
    source: metadata.source,
    locale: metadata.locale,
  };

  try {
    const entryId = await context.enqueueJob(job);
    context.logger.info({ jobId: job.id, entryId, guildId: job.guildId }, 'Enqueued game.werewolf.status');
    await acknowledge('Fetching the current Werewolf status.');
  } catch (error) {
    context.logger.error({ err: error, guildId: job.guildId, jobId: job.id }, 'Failed to enqueue werewolf.status');
    await acknowledge('Unable to fetch Werewolf status right now.');
  }
}
