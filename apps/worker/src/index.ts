import { Client, GatewayIntentBits } from 'discord.js';
import { loadWorkerConfig } from '@anankor/config';
import { createLogger } from '@anankor/logger';
import { bootstrapTelemetry } from '@anankor/telemetry';
import { createRedisClient, claimWorkerToken } from '@anankor/ipc';

async function main() {
  const config = loadWorkerConfig();
  const telemetry = await bootstrapTelemetry({
    serviceName: 'anankor-worker',
    serviceNamespace: 'apps',
  });
  const logger = createLogger({ name: 'worker' });

  logger.info({ claimed: false }, 'Worker starting up');

  const redis = createRedisClient(config.redisUrl);
  const claim = await claimWorkerToken(redis, config.workerTokens);

  logger.info({ workerId: claim.workerId }, 'Worker claimed token');

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });

  client.once('ready', (readyClient) => {
    logger.info(
      { workerId: claim.workerId, user: readyClient.user.tag },
      'Worker bot connected to Discord gateway',
    );
  });

  client.on('error', (err) => {
    logger.error({ err, workerId: claim.workerId }, 'Worker Discord client error');
  });

  await client.login(claim.token);

  const keepAlive = setInterval(() => undefined, 1 << 30);

  const shutdown = async () => {
    logger.info('Worker shutting down');
    clearInterval(keepAlive);
    await client.destroy();
    await claim.release();
    await telemetry.shutdown();
    redis.disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  const logger = createLogger({ name: 'worker' });
  logger.error({ err: error }, 'Worker failed to start');
  process.exit(1);
});
