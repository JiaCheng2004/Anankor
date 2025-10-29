export const STREAMS = {
  jobs: 'anankor:jobs',
  jobsDlq: 'anankor:jobs:dlq',
};

export const KEYSPACES = {
  jobDedupe: (id: string) => `anankor:jobs:dedupe:${id}`,
  workerClaim: (hash: string) => `anankor:workers:claims:${hash}`,
  workerPresence: (workerId: string) => `anankor:workers:presence:${workerId}`,
  workerSessions: (workerId: string) => `anankor:music:workers:${workerId}:sessions`,
  workerPool: 'anankor:workers:pool',
  musicAffinity: (sessionKey: string) => `anankor:music:affinity:${sessionKey}`,
  musicSessionMetadata: (sessionKey: string) => `anankor:music:sessions:${sessionKey}:meta`,
  musicSessionQueue: (sessionKey: string) => `anankor:music:sessions:${sessionKey}:queue`,
  musicSessionCurrent: (sessionKey: string) => `anankor:music:sessions:${sessionKey}:current`,
  musicGuildSessions: (guildId: string) => `anankor:music:guilds:${guildId}:sessions`,
};
