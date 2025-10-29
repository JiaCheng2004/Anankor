import type { ChatInputCommandInteraction, Message } from 'discord.js';
import type { CommandRequester, CommandSource } from '@anankor/schemas';
import { MusicSchedulerError } from '../services/musicScheduler.js';

export interface CommandJobMetadata {
  guildId: string;
  textChannelId: string;
  requester: CommandRequester;
  locale?: string;
  source: CommandSource;
}

export function resolveLocaleFromInteraction(interaction: ChatInputCommandInteraction): string | undefined {
  return interaction.locale ?? interaction.guildLocale ?? undefined;
}

export function resolveLocaleFromMessage(message: Message): string | undefined {
  return message.guild?.preferredLocale ?? undefined;
}

export function buildInteractionMetadata(interaction: ChatInputCommandInteraction): CommandJobMetadata | null {
  if (!interaction.inCachedGuild() || !interaction.guildId || !interaction.channelId) {
    return null;
  }

  return {
    guildId: interaction.guildId,
    textChannelId: interaction.channelId,
    requester: {
      userId: interaction.user.id,
      username: interaction.user.tag,
    },
    locale: resolveLocaleFromInteraction(interaction),
    source: 'interaction',
  };
}

export function buildMessageMetadata(message: Message): CommandJobMetadata | null {
  if (!message.inGuild() || !message.guildId) {
    return null;
  }

  return {
    guildId: message.guildId,
    textChannelId: message.channelId,
    requester: {
      userId: message.author.id,
      username: message.author.tag,
    },
    locale: resolveLocaleFromMessage(message),
    source: 'prefix',
  };
}

export function getVoiceChannelIdFromInteraction(interaction: ChatInputCommandInteraction): string | null {
  const member = interaction.member;
  if (!member) {
    return null;
  }

  if ('voice' in member) {
    return member.voice?.channelId ?? null;
  }

  return interaction.guild?.members.cache.get(interaction.user.id)?.voice?.channelId ?? null;
}

export function getVoiceChannelIdFromMessage(message: Message): string | null {
  const channel = message.member?.voice?.channelId ?? message.guild?.members.cache.get(message.author.id)?.voice?.channelId;
  return channel ?? null;
}

export async function replyToInteraction(
  interaction: ChatInputCommandInteraction,
  content: string,
  options: { ephemeral?: boolean } = {},
): Promise<void> {
  const payload = {
    content,
    ephemeral: options.ephemeral ?? true,
  };

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
}

export function resolveSchedulerErrorMessage(error: unknown): string | null {
  if (error instanceof MusicSchedulerError) {
    return error.message;
  }
  if (
    error &&
    typeof error === 'object' &&
    'name' in error &&
    (error as { name: string }).name === 'MusicSchedulerError' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return null;
}
