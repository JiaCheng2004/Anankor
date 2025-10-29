import { jobEnvelopeSchema, type JobEnvelope } from '@anankor/schemas';
import { STREAMS } from '@anankor/storage';
import type { RedisClient } from './index.js';

const JOB_PAYLOAD_FIELD = 'payload';

export const JOB_STREAM_KEY = STREAMS.jobs;
export const WORKER_JOB_STREAM_PREFIX = `${STREAMS.jobs}:worker`;

export interface JobStreamEntry {
  id: string;
  stream: string;
  payload: string;
}

export interface ReadJobOptions {
  count?: number;
  blockMs?: number;
}

type RawStreamEntry = [string, string[]];
type RawStreamResponse = [string, RawStreamEntry[]];

export function buildWorkerJobStreamKey(workerId: string): string {
  return `${WORKER_JOB_STREAM_PREFIX}:${workerId}`;
}

export async function publishJob(
  redis: RedisClient,
  job: JobEnvelope,
  streamKey: string = JOB_STREAM_KEY,
): Promise<string> {
  const payload = JSON.stringify(job);
  const entryId = await redis.xadd(streamKey, '*', JOB_PAYLOAD_FIELD, payload);
  if (typeof entryId !== 'string' || entryId.length === 0) {
    throw new Error('Redis xadd did not return an entry id');
  }
  return entryId;
}

export async function ensureJobConsumerGroup(
  redis: RedisClient,
  group: string,
  streamKey: string = JOB_STREAM_KEY,
): Promise<void> {
  try {
    await redis.xgroup('CREATE', streamKey, group, '0', 'MKSTREAM');
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    if (!error.message.includes('BUSYGROUP')) {
      throw error;
    }
  }
}

function normaliseEntries(response: RawStreamResponse[]): JobStreamEntry[] {
  const entries: JobStreamEntry[] = [];

  for (const [streamKey, streamEntries] of response) {
    for (const [entryId, fields] of streamEntries) {
      const record: Record<string, string> = {};
      for (let index = 0; index < fields.length; index += 2) {
        const field = fields[index];
        const value = fields[index + 1];
        if (typeof field === 'string' && typeof value === 'string') {
          record[field] = value;
        }
      }
      entries.push({
        id: entryId,
        stream: streamKey,
        payload: record[JOB_PAYLOAD_FIELD] ?? '',
      });
    }
  }

  return entries;
}

export async function readJobStream(
  redis: RedisClient,
  group: string,
  consumer: string,
  options: ReadJobOptions = {},
  streamKeys: string | string[] = JOB_STREAM_KEY,
): Promise<JobStreamEntry[]> {
  const streams = Array.isArray(streamKeys) ? streamKeys : [streamKeys];
  const args: Array<string | number> = ['GROUP', group, consumer];

  if (typeof options.count === 'number' && options.count > 0) {
    args.push('COUNT', options.count);
  }

  if (typeof options.blockMs === 'number' && options.blockMs > 0) {
    args.push('BLOCK', options.blockMs);
  }

  args.push('STREAMS');
  for (const stream of streams) {
    args.push(stream);
  }
  for (let index = 0; index < streams.length; index += 1) {
    args.push('>');
  }

  const response = (await (redis.xreadgroup as (...params: (string | number)[]) => Promise<RawStreamResponse[] | null>)(
    ...args,
  )) as RawStreamResponse[] | null;

  if (!response) {
    return [];
  }

  return normaliseEntries(response);
}

export function decodeJobEntry(entry: JobStreamEntry): JobEnvelope {
  const parsed = JSON.parse(entry.payload);
  return jobEnvelopeSchema.parse(parsed);
}

export async function acknowledgeJob(redis: RedisClient, group: string, entry: JobStreamEntry): Promise<void> {
  await redis.xack(entry.stream, group, entry.id);
}
