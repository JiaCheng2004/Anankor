# Architecture Overview

Anankor focuses exclusively on two Discord experiences: high-quality music playback and lightweight cooperative game session orchestration. Every subsystem should support one or both of these pillars with no extra surfaces for billing, premium upsells, or unrelated utilities.

The runtime remains split into two primary processes:

1. **Master bot** (`apps/master`) handles Discord command registration, validation, and job enqueueing.
2. **Worker bots** (`apps/worker`) scale horizontally to process Redis Stream jobs, interact with Lavalink, and persist state. Multiple bot tokens allow concurrent playback in the same guild; the master only orchestrates work and never joins voice channels itself.

Both processes share cross-cutting concerns through packages in `packages/` (config, logging, telemetry, storage, etc.). Redis Streams provide job dispatch, while DynamoDB stores idempotency, guild assignments, and persistent game session summaries. Observability is provided through Prometheus metrics and OpenTelemetry traces exported via the OTEL collector.

## Music Playback Flow

1. Master validates `/play`/`!play` style commands, enriches them with localization context, and computes a `sessionKey = <guildId>/<voiceChannelId>`. If the key already has a bound worker, the request is routed to that worker; otherwise a free worker is selected (respecting the per-guild cap of 5 concurrent sessions) and bound to the key. The master owns the authoritative queue for the session in Redis.
2. Master streams `music.playback.*` jobs to the assigned worker one track at a time. Workers acknowledge each track, maintain the Lavalink player for that specific voice channel, and emit lifecycle events (`trackStart`, `trackEnd`, `queueEmpty`) back to the master for UI updates. No rate limiting is applied within the guild as long as the cap is not exceeded.
3. The master refreshes embeds, queues follow-up jobs (e.g., auto-advance, autoplay), and maintains session affinity. If a worker crashes, the master posts “Playback crashed, retry /play”, clears the binding, and allows users to restart. Idle reclaim reaps inactive bindings after 10 minutes without queued audio.

## Game Session Flow

1. Master processes `/game` commands, writes or updates session metadata in Redis, and emits `game.session.*` jobs for worker-side orchestration.
2. Workers coordinate lobby roles, reminder scheduling, and voice channel moves while honoring seat limits and localization.
3. Completed sessions roll into DynamoDB records, enabling stats and cleanup jobs without blocking the hot path.
