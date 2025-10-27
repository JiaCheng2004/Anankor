# Anankor Worker Bot

Worker bots claim a unique Discord token, connect to Lavalink, and execute queued music jobs from Redis Streams.

## Local development

```bash
pnpm --filter @anankor/worker dev
```

## Responsibilities

- Claim a worker token and join the shared Redis Streams consumer group
- Execute job handlers (play, pause, queue, etc.)
- Maintain Lavalink sessions and emit Prometheus metrics
- Publish traces and structured logs for observability
