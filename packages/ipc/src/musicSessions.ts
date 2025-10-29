import { KEYSPACES } from '@anankor/storage';
import type { CommandRequester, CommandSource } from '@anankor/schemas';
import type { RedisClient } from './index.js';

export interface MusicQueueEntry {
  id: string;
  query: string;
  requester: CommandRequester;
  textChannelId: string;
  locale?: string;
  source: CommandSource;
  enqueuedAt: number;
}

export interface MusicSessionMetadata {
  sessionKey: string;
  guildId: string;
  voiceChannelId: string;
  workerId: string;
  textChannelId: string;
  locale?: string;
  lastActive: number;
}

export const SESSION_TTL_SECONDS = 600;
export const WORKER_PRESENCE_TTL_SECONDS = 30;

export function computeSessionKey(guildId: string, voiceChannelId: string): string {
  return `${guildId}/${voiceChannelId}`;
}

export async function setSessionMetadata(redis: RedisClient, metadata: MusicSessionMetadata): Promise<void> {
  const key = KEYSPACES.musicSessionMetadata(metadata.sessionKey);
  await redis.hset(key, {
    guildId: metadata.guildId,
    voiceChannelId: metadata.voiceChannelId,
    workerId: metadata.workerId,
    textChannelId: metadata.textChannelId,
    locale: metadata.locale ?? '',
    lastActive: metadata.lastActive.toString(),
  });
  await redis.expire(key, SESSION_TTL_SECONDS);
}

export async function getSessionMetadata(redis: RedisClient, sessionKey: string): Promise<MusicSessionMetadata | null> {
  const key = KEYSPACES.musicSessionMetadata(sessionKey);
  const result = await redis.hgetall(key);
  if (!result || Object.keys(result).length === 0) {
    return null;
  }

  const lastActive = Number.parseInt(result.lastActive ?? '0', 10);

  return {
    sessionKey,
    guildId: result.guildId ?? '',
    voiceChannelId: result.voiceChannelId ?? '',
    workerId: result.workerId ?? '',
    textChannelId: result.textChannelId ?? '',
    locale: result.locale && result.locale.length > 0 ? result.locale : undefined,
    lastActive: Number.isFinite(lastActive) ? lastActive : Date.now(),
  };
}

export async function touchSession(redis: RedisClient, sessionKey: string, timestamp: number = Date.now()): Promise<void> {
  const metaKey = KEYSPACES.musicSessionMetadata(sessionKey);
  await redis.hset(metaKey, { lastActive: timestamp.toString() });
  await redis.expire(metaKey, SESSION_TTL_SECONDS);
  await redis.expire(KEYSPACES.musicSessionQueue(sessionKey), SESSION_TTL_SECONDS);
  await redis.expire(KEYSPACES.musicSessionCurrent(sessionKey), SESSION_TTL_SECONDS);
  await redis.expire(KEYSPACES.musicAffinity(sessionKey), SESSION_TTL_SECONDS);
}

export async function appendQueueEntry(
  redis: RedisClient,
  sessionKey: string,
  entry: MusicQueueEntry,
): Promise<number> {
  const key = KEYSPACES.musicSessionQueue(sessionKey);
  const payload = JSON.stringify(entry);
  const length = await redis.rpush(key, payload);
  await redis.expire(key, SESSION_TTL_SECONDS);
  return length;
}

export async function listQueueEntries(
  redis: RedisClient,
  sessionKey: string,
  start = 0,
  stop = -1,
): Promise<MusicQueueEntry[]> {
  const key = KEYSPACES.musicSessionQueue(sessionKey);
  const entries = await redis.lrange(key, start, stop);
  return entries
    .map(parseQueueEntry)
    .filter((value: MusicQueueEntry | null): value is MusicQueueEntry => value !== null);
}

export async function queueLength(redis: RedisClient, sessionKey: string): Promise<number> {
  return redis.llen(KEYSPACES.musicSessionQueue(sessionKey));
}

export async function shiftQueueEntry(redis: RedisClient, sessionKey: string): Promise<MusicQueueEntry | null> {
  const key = KEYSPACES.musicSessionQueue(sessionKey);
  const payload = await redis.lpop(key);
  if (!payload) {
    return null;
  }

  await redis.expire(key, SESSION_TTL_SECONDS);
  return parseQueueEntry(payload);
}

export async function clearQueue(redis: RedisClient, sessionKey: string): Promise<void> {
  await redis.del(KEYSPACES.musicSessionQueue(sessionKey));
}

export async function getCurrentEntry(redis: RedisClient, sessionKey: string): Promise<MusicQueueEntry | null> {
  const payload = await redis.get(KEYSPACES.musicSessionCurrent(sessionKey));
  if (!payload) {
    return null;
  }
  return parseQueueEntry(payload);
}

export async function setCurrentEntry(
  redis: RedisClient,
  sessionKey: string,
  entry: MusicQueueEntry,
): Promise<void> {
  const key = KEYSPACES.musicSessionCurrent(sessionKey);
  await redis.set(key, JSON.stringify(entry), 'EX', SESSION_TTL_SECONDS);
}

export async function clearCurrentEntry(redis: RedisClient, sessionKey: string): Promise<void> {
  await redis.del(KEYSPACES.musicSessionCurrent(sessionKey));
}

export async function addGuildSession(redis: RedisClient, guildId: string, sessionKey: string): Promise<void> {
  const key = KEYSPACES.musicGuildSessions(guildId);
  await redis.sadd(key, sessionKey);
  await redis.expire(key, SESSION_TTL_SECONDS);
}

export async function removeGuildSession(redis: RedisClient, guildId: string, sessionKey: string): Promise<void> {
  const key = KEYSPACES.musicGuildSessions(guildId);
  await redis.srem(key, sessionKey);
  await redis.expire(key, SESSION_TTL_SECONDS);
}

export async function listGuildSessions(redis: RedisClient, guildId: string): Promise<string[]> {
  return redis.smembers(KEYSPACES.musicGuildSessions(guildId));
}

export async function guildSessionCount(redis: RedisClient, guildId: string): Promise<number> {
  return redis.scard(KEYSPACES.musicGuildSessions(guildId));
}

export async function addWorkerSession(redis: RedisClient, workerId: string, sessionKey: string): Promise<void> {
  const key = KEYSPACES.workerSessions(workerId);
  await redis.sadd(key, sessionKey);
}

export async function removeWorkerSession(redis: RedisClient, workerId: string, sessionKey: string): Promise<void> {
  const key = KEYSPACES.workerSessions(workerId);
  await redis.srem(key, sessionKey);
}

export async function listWorkerSessions(redis: RedisClient, workerId: string): Promise<string[]> {
  return redis.smembers(KEYSPACES.workerSessions(workerId));
}

export async function workerSessionCount(redis: RedisClient, workerId: string): Promise<number> {
  return redis.scard(KEYSPACES.workerSessions(workerId));
}

export async function registerWorkerInPool(redis: RedisClient, workerId: string): Promise<void> {
  await redis.sadd(KEYSPACES.workerPool, workerId);
  await refreshWorkerPresence(redis, workerId);
}

export async function refreshWorkerPresence(
  redis: RedisClient,
  workerId: string,
  ttlSeconds: number = WORKER_PRESENCE_TTL_SECONDS,
): Promise<void> {
  await redis.set(KEYSPACES.workerPresence(workerId), '1', 'EX', ttlSeconds);
}

export async function unregisterWorkerFromPool(redis: RedisClient, workerId: string): Promise<void> {
  await redis.srem(KEYSPACES.workerPool, workerId);
  await redis.del(KEYSPACES.workerPresence(workerId));
  await redis.del(KEYSPACES.workerSessions(workerId));
}

export async function isWorkerPresent(redis: RedisClient, workerId: string): Promise<boolean> {
  const result = await redis.exists(KEYSPACES.workerPresence(workerId));
  return result === 1;
}

export async function releaseSessionBindings(
  redis: RedisClient,
  sessionKey: string,
  metadata: MusicSessionMetadata | null,
): Promise<void> {
  if (metadata) {
    await removeGuildSession(redis, metadata.guildId, sessionKey);
    await removeWorkerSession(redis, metadata.workerId, sessionKey);
  }
  await redis.del(KEYSPACES.musicAffinity(sessionKey));
  await redis.del(KEYSPACES.musicSessionMetadata(sessionKey));
  await redis.del(KEYSPACES.musicSessionQueue(sessionKey));
  await redis.del(KEYSPACES.musicSessionCurrent(sessionKey));
}

export async function fetchWorkerPool(redis: RedisClient): Promise<string[]> {
  return redis.smembers(KEYSPACES.workerPool);
}

function parseQueueEntry(payload: string): MusicQueueEntry | null {
  try {
    const parsed = JSON.parse(payload) as Partial<MusicQueueEntry>;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.id === 'string' &&
      typeof parsed.query === 'string' &&
      typeof parsed.requester === 'object' &&
      parsed.requester !== null &&
      typeof parsed.requester.userId === 'string' &&
      typeof parsed.requester.username === 'string' &&
      typeof parsed.textChannelId === 'string' &&
      typeof parsed.source === 'string' &&
      typeof parsed.enqueuedAt === 'number'
    ) {
      return {
        id: parsed.id,
        query: parsed.query,
        requester: {
          userId: parsed.requester.userId,
          username: parsed.requester.username,
        },
        textChannelId: parsed.textChannelId,
        locale: parsed.locale,
        source: parsed.source,
        enqueuedAt: parsed.enqueuedAt,
      };
    }
  } catch (error) {
    // Ignore malformed entry.
  }
  return null;
}
