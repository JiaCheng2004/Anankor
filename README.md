# Anankor Discord Platform

Anankor is a distributed Discord platform composed of a coordinating master bot, a pool of worker bots, and supporting HTTP services. The system is being rewritten in Rust using Serenity + Poise for bot orchestration, Songbird for audio, Axum for web APIs, Redis for coordination, and DynamoDB for durable state.

## Repository Layout

- `backend/` – backend service responsible for database access and core business logic.
- `bot/` – Discord-facing frontend that delegates work to the backend APIs.
- `dynamodb/` – custom DynamoDB Local image with Los Angeles timezone baked in.
- `redis/` – Redis build context configured for the Los Angeles timezone.
- `lavalink/` – Lavalink build context with timezone and password settings.
- `infrastructure/prometheus` – scrape configuration for Prometheus.
- `infrastructure/tempo` – Tempo configuration for OTLP ingest.
- `ops/` – automation scripts and long-running test flows.
- `docs/adr/` – architectural decision records.
- `legacy/` – pointer to the deprecated TypeScript implementation for reference.

Refer to [AGENTS.md](AGENTS.md) for contributor guidelines.

## Getting Started

1. Install Rust (stable) via `rustup` and enable required components:
   ```bash
   rustup show active-toolchain
   rustup component add rustfmt clippy
   ```
2. Start dependencies with Podman (or Docker):
   ```bash
   podman-compose up --detach
   ```
3. Copy `.env.example` to `.env.local` and populate Discord tokens, AWS creds, and Lavalink password.
4. Run the standard checks:
   ```bash
   just ci
   ```
5. Launch services as needed:
   ```bash
   cargo run -p backend
   cargo run -p bot
   ```

## Testing & Tooling

- `just fmt` – format the workspace (`cargo fmt --all`).
- `just lint` – run Clippy with warnings-as-errors.
- `just test` – execute all tests.
- `ops/checks.sh` – shell-friendly CI bundle (fmt, clippy, test).

## Observability Stack

- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3000` (admin/admin)
- Tempo: OTLP HTTP ingest at `http://localhost:4318`

## License

MIT License. See `LICENSE` once added.
