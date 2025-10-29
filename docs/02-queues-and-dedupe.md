# Queues and Dedupe

- **Redis Streams** (`anankor:jobs`) are used as the primary work queue with consumer groups to balance workers. Job payloads include a `type` field to distinguish `music.playback.*` actions from `game.session.*` orchestration tasks.
- Music playback jobs include a `sessionKey = <guildId>/<voiceChannelId>` so the master can enforce sticky routing. `anankor:music:affinity:<sessionKey>` holds the current worker id; attempts to bind a second worker to the same voice channel are rejected unless the first binding expires.
- Each job carries an `idempotencyKey`. Masters perform a conditional write into DynamoDB (`JobDedupe` item) before enqueueing; failures indicate duplicates to drop. Use namespacing (`music:<key>`, `game:<key>`) to keep the two domains from colliding unintentionally.
- Workers acknowledge jobs with `XACK` and requeue failures with exponential backoff. Jobs exceeding retry thresholds land in `anankor:jobs:dlq` for inspection, tagged with their domain so on-call engineers can triage music vs. game regressions quickly.
- Token claims live in Redis keys (`anankor:workers:claims:<hash>`), refreshed via heartbeat to ensure a single worker per token.
- Master-owned music queues live in Redis hashes (`anankor:music:sessions:<sessionKey>`) that list upcoming tracks, loop flags, requester metadata, and the last acknowledged index. Workers pop the next track only when the master advances the pointer, preventing out-of-order playback.
- A background sweeper releases affinity entries and clears session queues after 10 minutes of inactivity, freeing the worker slot so the guild stays under its cap instead of hanging.
- Active game sessions track player rosters via ephemeral Redis hashes (`anankor:games:sessions:<sessionId>`). Workers update these within the same atomic pipelines that dequeue orchestration jobs to avoid race conditions.
