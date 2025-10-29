import { Client, GatewayIntentBits } from 'discord.js';
import { loadMasterConfig } from '@anankor/config';
import { createLogger } from '@anankor/logger';
import { bootstrapTelemetry } from '@anankor/telemetry';
import { createInteractionRouter } from '@anankor/discord';
import { createRedisClient, publishJob } from '@anankor/ipc';
import { MusicScheduler, MusicSchedulerError } from './services/musicScheduler.js';
import { createChatInputCommands, type ChatInputCommand, type CommandContext } from './commands/index.js';

const DEFAULT_PREFIX = '!';

async function main() {
  const config = loadMasterConfig();
  const telemetry = await bootstrapTelemetry({
    serviceName: 'anankor-master',
    serviceNamespace: 'apps',
  });
  const logger = createLogger({ name: 'master' });

  logger.info({ env: config.environment }, 'Master bot bootstrap starting');

  const redis = createRedisClient(config.redisUrl);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.MessageContent,
    ],
  });

  const musicScheduler = new MusicScheduler(redis, client, logger);

  const commandContext: CommandContext = {
    logger,
    enqueueJob: async (job) => {
      try {
        const scheduledId = await musicScheduler.trySchedule(job);
        if (scheduledId) {
          return scheduledId;
        }
      } catch (error) {
        if (error instanceof MusicSchedulerError) {
          throw error;
        }
        throw error;
      }
      return publishJob(redis, job);
    },
  };

  const commandRouter = createInteractionRouter();
  const commands = createChatInputCommands();
  const prefixCommandMap = buildPrefixCommandMap(commands);

  commands.forEach((command) => {
    commandRouter.register(command.data.name, async (interaction) => {
      if (!interaction.isChatInputCommand()) {
        logger.warn(
          { interactionType: interaction.type, command: command.data.name },
          'Received non chat-input interaction for chat-input command',
        );
        return;
      }
      await command.execute(interaction, commandContext);
    });
  });

  client.once('ready', async (readyClient) => {
    try {
      const commandPayloads = commands.map((command) => command.data.toJSON());
      const application = await readyClient.application?.fetch();
      if (!application) {
        logger.warn('Discord application details unavailable; skipping command registration');
        return;
      }
      await application.commands.set(commandPayloads);
      logger.info(
        {
          user: readyClient.user.tag,
          id: readyClient.user.id,
          registeredCommands: commandPayloads.map((command) => command.name),
        },
        'Master bot connected to Discord gateway and registered slash commands',
      );
    } catch (error) {
      logger.error({ err: error }, 'Failed to register slash commands');
    }
  });

  client.on('error', (err) => {
    logger.error({ err }, 'Discord client error');
  });

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    if (!commandRouter.has(interaction.commandName)) {
      logger.warn({ commandName: interaction.commandName }, 'Received slash command without registered handler');
      const response = {
        content: 'Command not recognised by the master bot.',
        ephemeral: true,
      } as const;
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(response);
      } else {
        await interaction.reply(response);
      }
      return;
    }

    try {
      await commandRouter.execute(interaction.commandName, interaction);
    } catch (error) {
      logger.error({ err: error, command: interaction.commandName }, 'Slash command handler failed');
      const response = {
        content: 'Something went wrong while executing that command. Please try again later.',
        ephemeral: true,
      } as const;
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(response).catch((followUpError) => {
          logger.error(
            { err: followUpError, command: interaction.commandName },
            'Failed to send follow up after handler error',
          );
        });
      } else {
        await interaction.reply(response).catch((replyError) => {
          logger.error({ err: replyError, command: interaction.commandName }, 'Failed to send reply after handler error');
        });
      }
    }
  });

  client.on('messageCreate', async (message) => {
    if (message.author.bot) {
      return;
    }

    if (!message.content.startsWith(DEFAULT_PREFIX)) {
      return;
    }

    const withoutPrefix = message.content.slice(DEFAULT_PREFIX.length).trim();
    if (withoutPrefix.length === 0) {
      return;
    }

    const [commandNameRaw, ...args] = withoutPrefix.split(/\s+/);
    const commandName = commandNameRaw.toLowerCase();
    const command = prefixCommandMap.get(commandName);

    if (!command || typeof command.executePrefix !== 'function') {
      logger.debug({ commandName }, 'Received prefix command without registered handler');
      return;
    }

    try {
      await command.executePrefix(message, args, commandContext, commandName);
    } catch (error) {
      logger.error({ err: error, command: commandName, messageId: message.id }, 'Prefix command handler failed');
      await message
        .reply('Something went wrong while executing that command. Please try again later.')
        .catch((replyError) => {
          logger.error(
            { err: replyError, command: commandName, messageId: message.id },
            'Failed to send reply after prefix handler error',
          );
        });
    }
  });

  await client.login(config.masterToken);

  const keepAlive = setInterval(() => undefined, 1 << 30);

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, 'Master bot shutting down');
    clearInterval(keepAlive);
    await client.destroy();
    await telemetry.shutdown();
    redis.disconnect();
    process.exit(0);
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  logger.info('Master bot ready and awaiting interactions.');
}

main().catch((error) => {
  const logger = createLogger({ name: 'master' });
  logger.error({ err: error }, 'Master bot failed to start');
  process.exit(1);
});

function buildPrefixCommandMap(commands: ChatInputCommand[]): Map<string, ChatInputCommand> {
  const map = new Map<string, ChatInputCommand>();

  for (const command of commands) {
    for (const alias of command.prefixNames) {
      map.set(alias.toLowerCase(), command);
    }
  }

  return map;
}
