export const STREAMS = {
  jobs: 'anankor:jobs',
  jobsDlq: 'anankor:jobs:dlq',
};

export const KEYSPACES = {
  jobDedupe: (id: string) => `anankor:jobs:dedupe:${id}`,
  workerClaim: (hash: string) => `anankor:workers:claims:${hash}`,
};
