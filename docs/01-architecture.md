# Architecture Overview

Anankor is split into two primary processes:

1. **Master bot** (`apps/master`) handles Discord command registration, validation, and job enqueueing.
2. **Worker bots** (`apps/worker`) scale horizontally to process Redis Stream jobs, interact with Lavalink, and persist state.

Both processes share cross-cutting concerns through packages in `packages/` (config, logging, telemetry, storage, etc.). Redis Streams provide job dispatch, while DynamoDB stores idempotency and guild assignments. Observability is provided through Prometheus metrics and OpenTelemetry traces exported via the OTEL collector.
