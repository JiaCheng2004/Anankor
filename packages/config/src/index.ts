import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const environmentSchema = z.enum(['development', 'test', 'staging', 'production']).default('development');

const baseSchema = z.object({
  NODE_ENV: environmentSchema,
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  OTLP_ENDPOINT: z.string().url().optional(),
});

type BaseEnv = z.infer<typeof baseSchema>;

const masterSchema = baseSchema.extend({
  DISCORD_MASTER_TOKEN: z.string().min(1, 'DISCORD_MASTER_TOKEN is required'),
});

const workerSchema = baseSchema.extend({
  CLAIM_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  WORKER_TOKEN_PREFIX: z.string().default('DISCORD_WORKER_TOKEN_'),
});

export interface MasterConfig {
  environment: BaseEnv['NODE_ENV'];
  masterToken: string;
  redisUrl: string;
  otlpEndpoint?: string;
}

export interface WorkerConfig {
  environment: BaseEnv['NODE_ENV'];
  redisUrl: string;
  otlpEndpoint?: string;
  workerTokens: string[];
  claimTtlSeconds: number;
}

export function loadMasterConfig(): MasterConfig {
  const env = masterSchema.parse(process.env);
  return {
    environment: env.NODE_ENV,
    masterToken: env.DISCORD_MASTER_TOKEN,
    redisUrl: env.REDIS_URL,
    otlpEndpoint: env.OTLP_ENDPOINT,
  };
}

export function loadWorkerConfig(): WorkerConfig {
  const env = workerSchema.parse(process.env);
  const tokens = collectWorkerTokens(env.WORKER_TOKEN_PREFIX);
  if (tokens.length === 0) {
    throw new Error(`No worker tokens found with prefix "${env.WORKER_TOKEN_PREFIX}"`);
  }
  return {
    environment: env.NODE_ENV,
    redisUrl: env.REDIS_URL,
    otlpEndpoint: env.OTLP_ENDPOINT,
    workerTokens: tokens,
    claimTtlSeconds: env.CLAIM_TTL_SECONDS,
  };
}

function collectWorkerTokens(prefix: string): string[] {
  return Object.entries(process.env)
    .filter(([key]) => key.startsWith(prefix))
    .map(([, value]) => value)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
}
