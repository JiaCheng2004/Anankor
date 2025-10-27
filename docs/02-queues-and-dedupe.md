# Queues and Dedupe

- **Redis Streams** (`anankor:jobs`) are used as the primary work queue with consumer groups to balance workers.
- Each job carries an `idempotencyKey`. Masters perform a conditional write into DynamoDB (`JobDedupe` item) before enqueueing; failures indicate duplicates to drop.
- Workers acknowledge jobs with `XACK` and requeue failures with exponential backoff. Jobs exceeding retry thresholds land in `anankor:jobs:dlq` for inspection.
- Token claims live in Redis keys (`anankor:workers:claims:<hash>`), refreshed via heartbeat to ensure a single worker per token.
