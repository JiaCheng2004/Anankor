# Repository Guidelines

This repository is evolving into a distributed Discord platform with a coordinating master bot, a pool of worker bots, and shared services covering music playback, party games, and future AI assistants. The stack centers on Rust with Serenity + Poise (Songbird for voice), Axum for HTTP APIs, Redis for coordination, and DynamoDB for durable state. Our near-term objective is to retire the legacy TypeScript prototype under `src/` and replace it with a Rust-first monorepo managed through Docker Compose. The guidance below explains how to align contributions with that direction so every change reinforces reliability, observability, and maintainability.

## Architecture Overview

At runtime the platform consists of cooperating binaries. The **master bot** listens to Discord gateway events, orchestrates slash commands, performs matchmaking between guild requests and worker capacity, and exposes administrative APIs for dashboards or automation. **Worker bots** implement task-specific capabilities (music, games, future AI chat) while offloading heavy lifting to Lavalink for audio, Redis for signaling, and DynamoDB for persistence. An Axum control API delivers REST and WebSocket endpoints for operations tooling, and a Redis or NATS job broker underpins asynchronous task routing and health probes. Packaging everything as Cargo crates inside one workspace lets us share data models, config parsing, and telemetry utilities without copy-paste.

Services default to stateless design. Persistent concerns such as playlists and game history live in DynamoDB modules, while transient coordination (worker availability, queue state, presence heartbeats) stays in Redis with expirations to avoid stale assignments. Axum services expose readiness and liveness probes so Docker Compose and future Kubernetes deployments can supervise processes. Songbird workers stream audio through a sidecar Lavalink container to keep transcoding outside bot processes. The blueprint favors horizontal scaling: add workers to increase throughput, or spin dedicated stacks per region by tweaking the compose file.

Multiple worker bots may run at once; launch each `worker-bot` binary in its own process with a distinct Discord token and capability feature set, and publish unique worker identifiers in Redis so the master can differentiate capacity when scheduling work.

## Project Structure & Module Organization

Treat the repository as a Cargo workspace rooted at `/` with the following layout. Create missing directories as you implement the monorepo; the names are conventional and should be reused to keep tooling and scripts simple.

- `apps/master-bot/`: Serenity + Poise binary that registers commands, assigns work to workers, and surfaces telemetry endpoints.
- `apps/worker-bot/`: Worker implementation compiled with feature flags (e.g., `music`, `games`) and capability modules under `src/capabilities/<feature>`.
- `services/control-api/`: Axum service for administrative HTTP/WebSocket APIs grouped by bounded context (`routes/guilds`, `routes/workers`, `routes/analytics`).
- `libs/core/`: Shared domain types, Serde DTOs, and matchmaking contracts consumed by every crate.
- `libs/infra/`: DynamoDB repositories, Redis pools, tracing bootstrap, error utilities, and AWS integration traits.
- `libs/proto/`: Optional protobuf/gRPC definitions if we add Songbird sidecars or external control planes.
- `infrastructure/`: `docker-compose.yaml`, environment samples, Helm charts, and migration scripts with their documentation.
- `ops/`: Operational scripts, e2e flows, and automation (e.g., `ops/checks.sh`, `ops/load-test/`).
- `legacy/`: Temporary home for the removed TypeScript reference code from commit `07913f2`; consult only for context.

Inside each crate prefer a three-tier module breakdown: `config` for typed settings, `domain` for business logic, and `transport` (commands, HTTP routes, event handlers). Keep module trees shallow; readers should not traverse more than three levels to find feature code.

## Environment & Configuration

Configuration comes from layered sources: default TOML files under `config/`, environment variables, and optional `.env.local` overrides. Use `figment` or `config` to merge inputs, validate on startup, and fail fast with actionable errors. Never commit `.env.local`; every binary needs a `config/default.toml` documenting keys such as `discord.token`, `redis.url`, `dynamo.endpoint`, `lavalink.nodes`, and `telemetry.otlp_endpoint`.

Use Docker Compose to spin dependencies. `docker-compose.yaml` should define DynamoDB Local, Redis, Lavalink, and observability tooling, each with health checks and named volumes. Update `infrastructure/compose/README.md` whenever service definitions change so operators can reproduce the stack.

Store secrets in external vaults (1Password, AWS Secrets Manager). For local work rely on `.env.local` plus `direnv` or `dotenvx`. Minimum keys: `DISCORD_MASTER_TOKEN`, `DISCORD_WORKER_TOKEN`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `REDIS_URL`, `LAVALINK_PASSWORD`. Startups must exit loudly when a required key is missing; integration tests should cover that path.

## Build, Test, and Development Commands

Workspace commands rely on stable Rust. Install the toolchain via `rustup` and keep it pinned with a `rust-toolchain.toml` file. The most common commands are:

- `cargo check`: Quick workspace validation; run before every push.
- `cargo fmt --all`: Apply `rustfmt` across crates; CI runs `--check`.
- `cargo clippy --all-targets --all-features -D warnings`: Static analysis; keep warning-free.
- `cargo test --all --all-targets`: Workspace tests; narrow with `-p` when iterating.
- `cargo run -p master-bot`: Start the master bot with `RUST_LOG=info` and local env vars.
- `cargo run -p worker-bot --features music`: Launch a music worker; map features to `src/capabilities`.
- `cargo run -p control-api`: Boot the Axum service; append `-- --port 8080` for overrides.
- `docker compose up`: Provision DynamoDB, Redis, Lavalink, and observability tooling.
- `cargo nextest run`: Optional accelerated runner; keep config in `nextest.toml`.
- `just ci`: Wrapper recipe bundling checks, lint, tests, and packaging.

Document any new scripts inside `ops/` and ensure they are idempotent. When you add commands that mutate cloud resources (e.g., migrating DynamoDB tables), require explicit flags like `--apply` to prevent accidental writes.

## Coding Style & Naming Conventions

Follow idiomatic Rust guidelines. Use 4-space indentation and `snake_case` for modules, files, and functions. Types and enums stay `PascalCase`, traits end with adjectives (`Queryable`, `Retryable`), and constants use `SCREAMING_SNAKE_CASE`. Slash commands should read as verbs (`/music play`, `/games start`) and delegate to domain services in `libs/core` rather than inlined logic.

Always run `rustfmt` and treat Clippy warnings as errors unless a justification accompanies `allow` attributes. Prefer structured concurrency with `tokio::task::JoinSet` or `tokio::select!`, and wrap long-lived tasks with cancellation-aware guards. Emit slow operation spans through `tracing` so observers can spot regressions quickly.

Configuration structs should derive `Deserialize`, `Clone`, and `Debug`. Error types belong in `thiserror::Error` implementations and map cleanly to Axum responses through shared `ApiError` wrappers. Isolate AWS SDK usage in `libs/infra` behind thin traits for testability, and keep module-level `//!` docs explaining how pieces cooperate. The legacy TypeScript code is historical only; do not extend it inside active crates.

## Testing Guidelines

Testing spans three levels. **Unit tests** live alongside code (`mod tests`) and focus on pure functions or compact state machines, using builders from `fake` or local fixtures. **Integration tests** reside under `apps/<crate>/tests/` or workspace `tests/` directories; run them with `tokio::test` and, when needed, spin ephemeral Redis or DynamoDB containers through `testcontainers`. Always clean up Discord data by exercising dedicated sandbox guilds (`TEST_GUILD_ID`, `TEST_VOICE_CHANNEL_ID`).

For music playback, add contract tests covering Redis queue serialization, worker handoff, and graceful degradation when Lavalink drops. Mock Songbird when possible; real Lavalink hits should be `#[ignore]` and executed in nightly suites. Game flows benefit from `proptest` scenarios that ensure no two games occupy one voice channel. Track coverage with `cargo tarpaulin --workspace` and keep core crates above 70%, calling out exceptions in PRs.

CI must execute `cargo fmt --check`, `cargo clippy`, and `cargo test`; include `cargo nextest` once we adopt it. End-to-end scripts under `ops/e2e/` should provision dependencies with Docker and run scenario binaries. Document the exact `docker-compose` file and command sequence so contributors can replay the suite locally.

## Observability & Operational Readiness

Every crate must initialize structured logging with `tracing` and emit spans to stdout. Decorate commands and HTTP handlers with `tracing::instrument`, and favor contextual logs over ad-hoc prints. Export metrics through `metrics` or `opentelemetry`, covering matchmaking latency, queue depth, Lavalink reconnects, and Redis round trips. Axum routes expose `/health/ready` and `/health/live`; bots publish heartbeats to expiring Redis sets so the master can detect outages. When adding features, update `ops/runbooks/` with alert responses, restart steps, and dashboard updates. Observability code should never panic—propagate typed errors for supervisors to handle.

## Commit & Pull Request Guidelines

Commit history currently uses Conventional Commit prefixes (`feat:`, `fix:`, `chore:`). Continue this format, extending it with scope qualifiers when helpful (`feat(master): add matchmaking pool`). Keep commits atomic: one logical change per commit, tests updated in the same commit when possible. Use imperative mood in summaries and limit them to 72 characters. Multi-line commit bodies should answer the “what” and “why,” referencing issue IDs with `Refs #123`.

Pull requests must include:

- A summary describing the change, impact, and the subsystem touched (`master-bot`, `worker-bot`, `control-api`, `infra`).
- Linked issues or task IDs to maintain traceability.
- A checklist of local verifications (`cargo fmt`, `cargo clippy`, `cargo test`, relevant e2e commands).
- Screenshots or terminal captures for user-facing or operational changes (e.g., new slash command output, Grafana dashboard).
- Notes on rollout/backout strategy when altering infrastructure or data schemas.

Request reviews from subject-matter owners (listed in CODEOWNERS once added). Avoid force pushes after reviews begin; instead, add fixup commits and squash only when the PR is ready to merge. Use draft PRs for work-in-progress items that still benefit from early feedback.

## Security & Data Handling

Handle secrets responsibly: never log raw Discord tokens, AWS keys, user IDs, or game transcripts. Hash identifiers with a stable salt, encrypt sensitive DynamoDB attributes, and run `cargo update` plus `cargo audit` on a schedule. If a crate needs `unsafe`, isolate it, document the rationale, and cover it with regression tests. Respect Discord rate limits by funneling API calls through Poise middleware and storing allowlists in Redis. Workers must verify master payloads via signed tokens, and external media integrations should cache only transient assets to remain compliant.

## Documentation & Knowledge Sharing

Each crate should contain a concise `README.md` covering purpose, commands, and config. Capture architectural decisions in `docs/adr/` so trade-offs stay visible, and complement complex flows with updated `mermaid` diagrams when it helps future readers. Operational procedures belong in `ops/runbooks/` (deploying workers, rotating Lavalink credentials, migrating data). Update this guide and component READMEs in the same PR whenever behavior changes.

## Onboarding Checklist

New contributors should follow this checklist to ramp quickly:

- Install Rust (stable) plus supporting tools (`rustup`, `cargo-nextest`, `cargo-tarpaulin`, `just`).
- Set up Docker and confirm `docker compose up` starts DynamoDB, Redis, Lavalink, and observability services.
- Create `.env.local` with Discord tokens and AWS credentials targeting local stacks.
- Run `cargo check`, `cargo fmt`, `cargo clippy`, and `cargo test` to verify a clean baseline.
- Launch `cargo run -p master-bot` and `cargo run -p worker-bot --features music` against a sandbox guild.
- Review relevant `docs/adr/` entries and `ops/runbooks/` before changing a subsystem.
- Join the internal Discord test guild and secure access to dashboards that cover your features.

By adhering to these guidelines we establish a predictable, professional workflow that lets the team scale the platform quickly while guarding reliability, security, and contributor happiness. Contributions that align with this guide will integrate smoothly and keep the system moving toward its ambitious roadmap of multi-bot orchestration, rich media experiences, and advanced AI companions.
