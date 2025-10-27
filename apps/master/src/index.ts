import { Client, GatewayIntentBits } from 'discord.js';
import { loadMasterConfig } from '@anankor/config';
import { createLogger } from '@anankor/logger';
import { bootstrapTelemetry } from '@anankor/telemetry';

async function main() {
  const config = loadMasterConfig();
  const telemetry = await bootstrapTelemetry({
    serviceName: 'anankor-master',
    serviceNamespace: 'apps',
  });
  const logger = createLogger({ name: 'master' });

  logger.info({ env: config.environment }, 'Master bot bootstrap starting');

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });

  client.once('ready', (readyClient) => {
    logger.info(
      { user: readyClient.user.tag, id: readyClient.user.id },
      'Master bot connected to Discord gateway',
    );
  });

  client.on('error', (err) => {
    logger.error({ err }, 'Discord client error');
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
