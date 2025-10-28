# Architecture Overview

Anankor focuses exclusively on two Discord experiences: high-quality music playback and lightweight cooperative game session orchestration. Every subsystem should support one or both of these pillars with no extra surfaces for billing, premium upsells, or unrelated utilities.

The runtime remains split into two primary processes:

1. **Master bot** (`apps/master`) handles Discord command registration, validation, and job enqueueing.
2. **Worker bots** (`apps/worker`) scale horizontally to process Redis Stream jobs, interact with Lavalink, and persist state.

Both processes share cross-cutting concerns through packages in `packages/` (config, logging, telemetry, storage, etc.). Redis Streams provide job dispatch, while DynamoDB stores idempotency, guild assignments, and persistent game session summaries. Observability is provided through Prometheus metrics and OpenTelemetry traces exported via the OTEL collector.

## Music Playback Flow

1. Master validates `/play`/`!play` style commands, enriches them with localization context, and enqueues `music.playback.*` jobs.
2. Workers claim guild ownership, resolve tracks through Lavalink, and emit lifecycle events (`trackStart`, `trackEnd`, `queueEmpty`) back to the master for UI updates.
3. The master refreshes embeds, queues follow-up jobs (e.g., auto-advance, autoplay), and maintains per-guild state in Redis.

## Game Session Flow

1. Master processes `/game` commands, writes or updates session metadata in Redis, and emits `game.session.*` jobs for worker-side orchestration.
2. Workers coordinate lobby roles, reminder scheduling, and voice channel moves while honoring seat limits and localization.
3. Completed sessions roll into DynamoDB records, enabling stats and cleanup jobs without blocking the hot path.
