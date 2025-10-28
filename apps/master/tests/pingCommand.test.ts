import {
  MessageFlags,
  type ChatInputCommandInteraction,
  type Message,
  type MessageCreateOptions,
  type MessagePayload,
} from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { pingCommand } from '../src/commands/ping.js';
import type { CommandContext } from '../src/commands/types.js';

describe('pingCommand', () => {
  it('enqueues a worker ping job and acknowledges the user (slash command)', async () => {
    const context = createCommandContext();
    const interaction = createInteraction();

    await pingCommand.execute(interaction, context);

    expect(context.enqueueJob).toHaveBeenCalledTimes(1);
    const payload = context.enqueueJob.mock.calls[0][0];
    expect(payload.type).toBe('ping.respond');
    expect(payload.guildId).toBe('guild-123');
    expect(payload.channelId).toBe('channel-456');
    expect(payload.requester.userId).toBe('user-789');

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.Ephemeral }),
    );
    expect(interaction.replies[0]?.content).toContain('Handed off your ping');
  });

  it('rejects usage outside of a guild (slash command)', async () => {
    const context = createCommandContext();
    const interaction = createInteraction({
      guildId: null,
      inCachedGuild: () => false,
    });

    await pingCommand.execute(interaction, context);

    expect(context.enqueueJob).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'This command can only be used inside a Discord server.',
        flags: MessageFlags.Ephemeral,
      }),
    );
  });

  it('supports prefix invocation', async () => {
    const context = createCommandContext();
    const message = createMessage();

    await pingCommand.executePrefix?.(message, [], context);

    expect(context.enqueueJob).toHaveBeenCalledTimes(1);
    const payload = context.enqueueJob.mock.calls[0][0];
    expect(payload.type).toBe('ping.respond');
    expect(payload.guildId).toBe('guild-999');
    expect(payload.channelId).toBe('channel-111');
    expect(payload.requester.userId).toBe('user-222');

    expect(message.reply).toHaveBeenCalledWith(expect.stringContaining('Handed off your ping'));
  });

  it('rejects prefix usage outside of a guild', async () => {
    const context = createCommandContext();
    const message = createMessage({ guildId: null });

    await pingCommand.executePrefix?.(message, [], context);

    expect(context.enqueueJob).not.toHaveBeenCalled();
    expect(message.reply).toHaveBeenCalledWith('This command can only be used inside a Discord server.');
  });
});

function createCommandContext(): CommandContext & {
  enqueueJob: ReturnType<typeof vi.fn>;
} {
  const enqueueJob = vi.fn(async () => 'stream-entry-id');
  const logger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => logger),
  } as unknown as CommandContext['logger'];

  return {
    logger,
    enqueueJob,
  };
}

function createInteraction(
  overrides: Partial<ChatInputCommandInteraction> = {},
): ChatInputCommandInteraction & {
  replies: Array<{ content: string; flags: MessageFlags }>;
} {
  const replies: Array<{ content: string; flags: MessageFlags }> = [];

  const base = {
    id: 'interaction-1',
    guildId: 'guild-123',
    channelId: 'channel-456',
    user: {
      id: 'user-789',
      tag: 'tester#0001',
    },
    deferred: false,
    replied: false,
    inCachedGuild: () => true,
    reply: vi.fn(async (payload: { content: string; flags: MessageFlags }) => {
      replies.push(payload);
      base.replied = true;
      return Promise.resolve();
    }),
    followUp: vi.fn(async (payload: { content: string; flags: MessageFlags }) => {
      replies.push(payload);
      return Promise.resolve();
    }),
    replies,
  };

  return Object.assign(base, overrides) as ChatInputCommandInteraction & {
    replies: Array<{ content: string; flags: MessageFlags }>;
  };
}

function createMessage(
  overrides: Partial<Message> & Record<string, unknown> = {},
): Message & {
  replies: (string | MessagePayload | MessageCreateOptions)[];
} {
  const replies: (string | MessagePayload | MessageCreateOptions)[] = [];

  const base: Partial<Message> & {
    replies: typeof replies;
  } = {
    id: 'message-1',
    guildId: 'guild-999',
    channelId: 'channel-111',
    author: {
      id: 'user-222',
      tag: 'tester#0002',
      bot: false,
    },
    reply: vi.fn(async (payload: string | MessagePayload | MessageCreateOptions) => {
      replies.push(payload);
      return Promise.resolve(null);
    }),
    content: '!ping',
    replies,
  };

  base.inGuild = () => base.guildId != null;

  return Object.assign(base, overrides) as Message & {
    replies: (string | MessagePayload | MessageCreateOptions)[];
  };
}
