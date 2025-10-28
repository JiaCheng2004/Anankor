import type {
  ChatInputCommandInteraction,
  Message,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import type { JobEnvelope } from '@anankor/schemas';
import type { createLogger } from '@anankor/logger';

export interface CommandContext {
  logger: ReturnType<typeof createLogger>;
  enqueueJob: (job: JobEnvelope) => Promise<string>;
}

export interface ChatInputCommand {
  data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction, context: CommandContext) => Promise<void>;
  prefixNames: string[];
  executePrefix?: (message: Message, args: string[], context: CommandContext, alias: string) => Promise<void>;
}
