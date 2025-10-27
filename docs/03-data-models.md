# Data Models

## DynamoDB (single-table)

- `PK=GUILD#<guildId>`, `SK=ASSIGNMENT` stores the worker bot assigned to the guild plus timestamps.
- `PK=JOB#<idempotencyKey>`, `SK=DEDUPE` ensures job uniqueness with a TTL.
- `PK=WORKER#<botUserId>`, `SK=PROFILE` contains worker heartbeat metadata used for rebalancing.

## Redis

- `anankor:jobs` / `anankor:jobs:dlq` streams for work and dead-letter entries.
- `anankor:jobs:dedupe:<id>` keyed by job idempotency for fast duplicate detection.
- `anankor:workers:claims:<tokenHash>` ensures one worker owns a Discord token at a time.
