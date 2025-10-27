# Anankor Master Bot

The master bot exposes Discord-facing functionality, registers slash commands, and enqueues work for workers while ensuring idempotency and observability.

## Local development

```bash
pnpm --filter @anankor/master dev
```

## Responsibilities

- Register commands and interaction handlers
- Validate and enqueue jobs into Redis Streams
- Track guild-to-worker assignments and dedupe jobs via DynamoDB
- Expose `/health`, `/ready`, and `/metrics`
