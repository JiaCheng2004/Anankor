# Data Models

## DynamoDB (single-table)

- `PK=SESSION#<guildId>#<voiceChannelId>`, `SK=WORKER` stores the worker binding for the voice channel along with the last heartbeat. A TTL supports the 10-minute idle reclaim.
- `PK=GUILD#<guildId>`, `SK=WORKER_CAP` records the configured concurrent worker limit (default 5) so overrides propagate to scheduling.
- `PK=JOB#<idempotencyKey>`, `SK=DEDUPE` ensures job uniqueness with a TTL.
- `PK=WORKER#<botUserId>`, `SK=PROFILE` contains worker heartbeat metadata used for rebalancing.
- `PK=GUILD#<guildId>`, `SK=GAME#<sessionId>` persists completed game sessions with metadata such as host, player roster, outcome summary, and duration.

## Redis

- `anankor:jobs` / `anankor:jobs:dlq` streams for work and dead-letter entries.
- `anankor:jobs:dedupe:<id>` keyed by job idempotency for fast duplicate detection.
- `anankor:workers:claims:<tokenHash>` ensures one worker owns a Discord token at a time.
- `anankor:music:sessions:<sessionKey>` hashes store authoritative playback queues, voice/channel metadata, and the bound worker id (`sessionKey = guildId/voiceChannelId`).
- `anankor:music:affinity:<sessionKey>` strings cache the sticky worker binding for fast routing between Redis lookups and DynamoDB refreshes.
- `anankor:games:sessions:<sessionId>` hashes keep active session state (host, status, player list) synced between master and workers.
- `anankor:games:roster:<sessionId>` sorted sets provide deterministic ordering for RSVP lists and waitlists.
