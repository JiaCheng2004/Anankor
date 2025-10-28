import { SlashCommandBuilder } from 'discord.js';
import { generateJobId } from '@anankor/ipc';
import type { GameTurtleHintJob, GameTurtleStartJob, GameTurtleSummaryJob } from '@anankor/schemas';
import type { ChatInputCommand } from './types.js';
import { buildInteractionMetadata, buildMessageMetadata, replyToInteraction, type CommandJobMetadata } from './utils.js';

const COMMAND_NAME = 'turtle';

const TURTLE_PREFIX_MAP: Record<string, 'start' | 'hint' | 'summary'> = {
  turtle: 'start',
  turtlestart: 'start',
  ts: 'start',
  soup: 'start',
  riddle: 'start',
  turtlehint: 'hint',
  thint: 'hint',
  hint: 'hint',
  clue: 'hint',
  turtlesum: 'summary',
  tsum: 'summary',
  summary: 'summary',
  recap: 'summary',
  facts: 'summary',
};

export function createTurtleCommand(): ChatInputCommand {
  return {
    data: new SlashCommandBuilder()
      .setName(COMMAND_NAME)
      .setDescription('Run Turtle Soup riddle sessions.')
      .addSubcommand((subcommand) =>
        subcommand
          .setName('start')
          .setDescription('Start a new Turtle Soup scenario.')
          .addStringOption((option) =>
            option.setName('prompt').setDescription('Optional prompt or title for the scenario.').setRequired(false),
          ),
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('hint')
          .setDescription('Request or share a hint for the current scenario.')
          .addStringOption((option) =>
            option.setName('details').setDescription('Optional hint text or request.').setRequired(false),
          ),
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('summary')
          .setDescription('Post the known facts or final answer summary.')
          .addStringOption((option) =>
            option.setName('details').setDescription('Optional summary text.').setRequired(false),
          ),
      ),
    prefixNames: Object.keys(TURTLE_PREFIX_MAP),
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
            prompt: interaction.options.getString('prompt') ?? undefined,
            metadata,
            context,
            idempotencyKey: interaction.id,
            acknowledge: (msg) => replyToInteraction(interaction, msg),
          });
          return;
        case 'hint':
          await handleHint({
            request: interaction.options.getString('details') ?? undefined,
            metadata,
            context,
            idempotencyKey: interaction.id,
            acknowledge: (msg) => replyToInteraction(interaction, msg),
          });
          return;
        case 'summary':
          await handleSummary({
            summary: interaction.options.getString('details') ?? undefined,
            metadata,
            context,
            idempotencyKey: interaction.id,
            acknowledge: (msg) => replyToInteraction(interaction, msg),
          });
          return;
        default:
          await replyToInteraction(interaction, 'Unsupported Turtle Soup action.');
      }
    },
    async executePrefix(message, args, context, alias) {
      const action = TURTLE_PREFIX_MAP[alias];
      if (!action) {
        await message.reply('Unknown Turtle Soup action.');
        return;
      }

      const metadata = buildMessageMetadata(message);
      if (!metadata) {
        await message.reply('This command can only be used inside a Discord server.');
        return;
      }

      const text = args.join(' ').trim() || undefined;

      switch (action) {
        case 'start':
          await handleStart({
            prompt: text,
            metadata,
            context,
            idempotencyKey: message.id,
            acknowledge: (msg) => message.reply(msg),
          });
          break;
        case 'hint':
          await handleHint({
            request: text,
            metadata,
            context,
            idempotencyKey: message.id,
            acknowledge: (msg) => message.reply(msg),
          });
          break;
        case 'summary':
          await handleSummary({
            summary: text,
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
  prompt?: string;
}

async function handleStart(params: StartParams): Promise<void> {
  const { prompt, metadata, context, idempotencyKey, acknowledge } = params;

  const job: GameTurtleStartJob = {
    id: generateJobId(),
    type: 'game.turtle.start',
    idempotencyKey: `game.turtle.start:${idempotencyKey}`,
    createdAt: new Date(),
    guildId: metadata.guildId,
    textChannelId: metadata.textChannelId,
    requester: metadata.requester,
    source: metadata.source,
    locale: metadata.locale,
    prompt,
  };

  try {
    const entryId = await context.enqueueJob(job);
    context.logger.info({ jobId: job.id, entryId, guildId: job.guildId }, 'Enqueued game.turtle.start');
    await acknowledge('Starting a new Turtle Soup round.');
  } catch (error) {
    context.logger.error({ err: error, guildId: job.guildId, jobId: job.id }, 'Failed to enqueue turtle.start');
    await acknowledge('Unable to start a Turtle Soup round right now.');
  }
}

interface HintParams extends BaseParams {
  request?: string;
}

async function handleHint(params: HintParams): Promise<void> {
  const { request, metadata, context, idempotencyKey, acknowledge } = params;

  const job: GameTurtleHintJob = {
    id: generateJobId(),
    type: 'game.turtle.hint',
    idempotencyKey: `game.turtle.hint:${idempotencyKey}`,
    createdAt: new Date(),
    guildId: metadata.guildId,
    textChannelId: metadata.textChannelId,
    requester: metadata.requester,
    source: metadata.source,
    locale: metadata.locale,
    request,
  };

  try {
    const entryId = await context.enqueueJob(job);
    context.logger.info({ jobId: job.id, entryId, guildId: job.guildId }, 'Enqueued game.turtle.hint');
    await acknowledge('Processing your Turtle Soup hint.');
  } catch (error) {
    context.logger.error({ err: error, guildId: job.guildId, jobId: job.id }, 'Failed to enqueue turtle.hint');
    await acknowledge('Unable to handle hints right now.');
  }
}

interface SummaryParams extends BaseParams {
  summary?: string;
}

async function handleSummary(params: SummaryParams): Promise<void> {
  const { summary, metadata, context, idempotencyKey, acknowledge } = params;

  const job: GameTurtleSummaryJob = {
    id: generateJobId(),
    type: 'game.turtle.summary',
    idempotencyKey: `game.turtle.summary:${idempotencyKey}`,
    createdAt: new Date(),
    guildId: metadata.guildId,
    textChannelId: metadata.textChannelId,
    requester: metadata.requester,
    source: metadata.source,
    locale: metadata.locale,
    summary,
  };

  try {
    const entryId = await context.enqueueJob(job);
    context.logger.info({ jobId: job.id, entryId, guildId: job.guildId }, 'Enqueued game.turtle.summary');
    await acknowledge('Posting the Turtle Soup summary.');
  } catch (error) {
    context.logger.error({ err: error, guildId: job.guildId, jobId: job.id }, 'Failed to enqueue turtle.summary');
    await acknowledge('Unable to summarise the round right now.');
  }
}
