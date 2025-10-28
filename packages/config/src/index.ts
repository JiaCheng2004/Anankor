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
  LAVALINK_NODES: z.string().optional(),
  LAVALINK_HOST: z.string().default('lavalink'),
  LAVALINK_PORT: z.coerce.number().int().positive().default(2333),
  LAVALINK_PASSWORD: z.string().min(1, 'LAVALINK_PASSWORD is required'),
  LAVALINK_ID: z.string().default('primary'),
  LAVALINK_SECURE: z.string().optional(),
  LAVALINK_CLIENT_NAME: z.string().default('AnankorWorker'),
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
  lavalink: {
    nodes: LavalinkNodeConfig[];
    clientName: string;
  };
}

export interface LavalinkNodeConfig {
  id: string;
  host: string;
  port: number;
  password: string;
  secure: boolean;
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
  const lavalinkNodes = parseLavalinkNodes(env);
  return {
    environment: env.NODE_ENV,
    redisUrl: env.REDIS_URL,
    otlpEndpoint: env.OTLP_ENDPOINT,
    workerTokens: tokens,
    claimTtlSeconds: env.CLAIM_TTL_SECONDS,
    lavalink: {
      nodes: lavalinkNodes,
      clientName: env.LAVALINK_CLIENT_NAME,
    },
  };
}

function collectWorkerTokens(prefix: string): string[] {
  return Object.entries(process.env)
    .filter(([key]) => key.startsWith(prefix))
    .map(([, value]) => value)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
}

function parseLavalinkNodes(
  env: z.infer<typeof workerSchema>,
): LavalinkNodeConfig[] {
  if (typeof env.LAVALINK_NODES === 'string' && env.LAVALINK_NODES.trim().length > 0) {
    try {
      const parsed = JSON.parse(env.LAVALINK_NODES);
      if (!Array.isArray(parsed)) {
        throw new Error('LAVALINK_NODES must be a JSON array');
      }
      return parsed.map((node, index) => ({
        id: normaliseString(node?.id, env.LAVALINK_ID ?? `node-${index + 1}`),
        host: normaliseString(node?.host, env.LAVALINK_HOST),
        port: normalisePort(node?.port, env.LAVALINK_PORT),
        password: normaliseString(node?.password, env.LAVALINK_PASSWORD),
        secure: normaliseBoolean(node?.secure, env.LAVALINK_SECURE),
      }));
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to parse LAVALINK_NODES: ${error.message}`);
      }
      throw new Error('Failed to parse LAVALINK_NODES: Unknown error');
    }
  }

  return [
    {
      id: env.LAVALINK_ID,
      host: env.LAVALINK_HOST,
      port: env.LAVALINK_PORT,
      password: env.LAVALINK_PASSWORD,
      secure: normaliseBoolean(undefined, env.LAVALINK_SECURE),
    },
  ];
}

function normaliseString(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof fallback === 'string' && fallback.trim().length > 0) {
    return fallback.trim();
  }
  throw new Error('Expected non-empty string');
}

function normalisePort(value: unknown, fallback: number): number {
  const candidate = typeof value === 'number' ? value : Number(value);
  if (Number.isInteger(candidate) && candidate > 0 && candidate < 65536) {
    return candidate;
  }
  if (Number.isInteger(fallback) && fallback > 0 && fallback < 65536) {
    return fallback;
  }
  throw new Error('Invalid Lavalink port');
}

function normaliseBoolean(value: unknown, fallback: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const normalised = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalised)) {
      return true;
    }
    if (['0', 'false', 'no', 'n', 'off'].includes(normalised)) {
      return false;
    }
  }

  if (typeof fallback === 'boolean') {
    return fallback;
  }
  if (typeof fallback === 'string' && fallback.trim().length > 0) {
    return normaliseBoolean(fallback, undefined);
  }
  return false;
}
