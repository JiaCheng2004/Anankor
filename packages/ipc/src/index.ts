import IORedis, { type Redis as IORedisInstance } from 'ioredis';
import { customAlphabet } from 'nanoid';
import { createHash, randomUUID } from 'node:crypto';

export type RedisClient = IORedisInstance;

const RedisCtor = IORedis as unknown as {
  new (...args: unknown[]): RedisClient;
};

const workerIdAlphabet = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10);

export interface RedisConfig {
  lazyConnect?: boolean;
}

export function createRedisClient(url: string, config: RedisConfig = {}): RedisClient {
  return new RedisCtor(url, {
    lazyConnect: config.lazyConnect ?? true,
  });
}

export interface ClaimOptions {
  ttlSeconds?: number;
  heartbeatIntervalSeconds?: number;
}

export interface WorkerClaim {
  workerId: string;
  token: string;
  release: () => Promise<void>;
}

export async function claimWorkerToken(
  redis: RedisClient,
  tokens: string[],
  options: ClaimOptions = {},
): Promise<WorkerClaim> {
  if (tokens.length === 0) {
    throw new Error('No worker tokens provided');
  }

  const ttlSeconds = options.ttlSeconds ?? 60;
  const heartbeatIntervalSeconds = options.heartbeatIntervalSeconds ?? Math.max(20, Math.floor(ttlSeconds / 2));
  const workerId = `worker-${workerIdAlphabet(10)}`;

  for (const token of tokens) {
    const key = buildTokenClaimKey(token);
    const claimed = await redis.set(key, workerId, 'EX', ttlSeconds, 'NX');
    if (claimed !== 'OK') {
      continue;
    }

    const heartbeat = setInterval(() => {
      void redis.expire(key, ttlSeconds).catch((error: unknown) => {
        console.error('Failed to extend worker token claim heartbeat', error);
      });
    }, heartbeatIntervalSeconds * 1000);

    heartbeat.unref?.();

    const release = async () => {
      clearInterval(heartbeat);
      await redis.del(key);
    };

    return { workerId, token, release };
  }

  throw new Error('All worker tokens are currently claimed');
}

function buildTokenClaimKey(token: string): string {
  const digest = createHash('sha256').update(token).digest('hex');
  return `anankor:workers:claims:${digest}`;
}

export function generateJobId(): string {
  return randomUUID();
}

export * from './jobs.js';
export * from './musicSessions.js';
