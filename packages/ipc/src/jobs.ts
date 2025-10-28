import { jobEnvelopeSchema, type JobEnvelope } from '@anankor/schemas';
import { STREAMS } from '@anankor/storage';
import type { RedisClient } from './index.js';

const JOB_PAYLOAD_FIELD = 'payload';

export const JOB_STREAM_KEY = STREAMS.jobs;

export interface JobStreamEntry {
  id: string;
  payload: string;
}

export interface ReadJobOptions {
  count?: number;
  blockMs?: number;
}

type RawStreamEntry = [string, string[]];
type RawStreamResponse = [string, RawStreamEntry[]];

export async function publishJob(redis: RedisClient, job: JobEnvelope): Promise<string> {
  const payload = JSON.stringify(job);
  return redis.xadd(JOB_STREAM_KEY, '*', JOB_PAYLOAD_FIELD, payload);
}

export async function ensureJobConsumerGroup(redis: RedisClient, group: string): Promise<void> {
  try {
    await redis.xgroup('CREATE', JOB_STREAM_KEY, group, '0', 'MKSTREAM');
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

  for (const [, streamEntries] of response) {
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
): Promise<JobStreamEntry[]> {
  const args: Array<string | number> = ['GROUP', group, consumer];

  if (typeof options.count === 'number' && options.count > 0) {
    args.push('COUNT', options.count);
  }

  if (typeof options.blockMs === 'number' && options.blockMs > 0) {
    args.push('BLOCK', options.blockMs);
  }

  args.push('STREAMS', JOB_STREAM_KEY, '>');

  const response = (await redis.xreadgroup(...args)) as RawStreamResponse[] | null;

  if (!response) {
    return [];
  }

  return normaliseEntries(response);
}

export function decodeJobEntry(entry: JobStreamEntry): JobEnvelope {
  const parsed = JSON.parse(entry.payload);
  return jobEnvelopeSchema.parse(parsed);
}

export async function acknowledgeJob(redis: RedisClient, group: string, id: string): Promise<void> {
  await redis.xack(JOB_STREAM_KEY, group, id);
}
