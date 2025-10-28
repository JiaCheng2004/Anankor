# Queues and Dedupe

- **Redis Streams** (`anankor:jobs`) are used as the primary work queue with consumer groups to balance workers. Job payloads include a `type` field to distinguish `music.playback.*` actions from `game.session.*` orchestration tasks.
- Each job carries an `idempotencyKey`. Masters perform a conditional write into DynamoDB (`JobDedupe` item) before enqueueing; failures indicate duplicates to drop. Use namespacing (`music:<key>`, `game:<key>`) to keep the two domains from colliding unintentionally.
- Workers acknowledge jobs with `XACK` and requeue failures with exponential backoff. Jobs exceeding retry thresholds land in `anankor:jobs:dlq` for inspection, tagged with their domain so on-call engineers can triage music vs. game regressions quickly.
- Token claims live in Redis keys (`anankor:workers:claims:<hash>`), refreshed via heartbeat to ensure a single worker per token.
- Active game sessions track player rosters via ephemeral Redis hashes (`anankor:games:sessions:<sessionId>`). Workers update these within the same atomic pipelines that dequeue orchestration jobs to avoid race conditions.
