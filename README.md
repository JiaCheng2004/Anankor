# Anankor Monorepo

Anankor is a production-focused Discord music platform designed around a master/worker bot architecture. The repository prioritizes modularity, observability, and operational readiness from day one. It bundles the core Discord experiences (slash commands, voice playback via Lavalink, queue management) with a scalable job-processing pipeline powered by Redis Streams and DynamoDB-enforced idempotency.

---

## Table of Contents
1. [Key Features](#key-features)
2. [Architecture Overview](#architecture-overview)
3. [Repository Layout](#repository-layout)
4. [Technology Stack](#technology-stack)
5. [Getting Started](#getting-started)
    - [Prerequisites](#prerequisites)
    - [Environment Variables](#environment-variables)
    - [Installation](#installation)
6. [Local Development Workflows](#local-development-workflows)
    - [Running with Docker Compose](#running-with-docker-compose)
    - [Running TypeScript Apps Locally](#running-typescript-apps-locally)
    - [Watch Mode & Hot Reload](#watch-mode--hot-reload)
7. [Build, Test, and Lint Commands](#build-test-and-lint-commands)
8. [Packages & Apps Reference](#packages--apps-reference)
    - [Shared Packages](#shared-packages)
    - [Applications](#applications)
9. [Infrastructure & Observability](#infrastructure--observability)
10. [Scripts](#scripts)
11. [Testing Strategy](#testing-strategy)
12. [Deployment Considerations](#deployment-considerations)
13. [Troubleshooting](#troubleshooting)
14. [Roadmap](#roadmap)
15. [Contributing Guidelines](#contributing-guidelines)
16. [Security & Compliance](#security--compliance)
17. [License](#license)

---

## Key Features
- **Master/Worker Discord Architecture:** Master bot handles user interactions; worker bots execute queued jobs with per-token isolation.
- **Job Management with Idempotency:** Redis Streams consumer groups combined with DynamoDB for dedupe guarantees at enqueue time.
- **Music Playback via Lavalink:** Dedicated `@anankor/music` package manages Lavalink sessions, reconnections, and player abstractions.
- **Observability from Day One:** Prometheus metrics, OTEL traces, and pre-provisioned Grafana dashboards to monitor throughput, latency, and health.
- **Infrastructure as Code:** Docker Compose layout suitable for local development, with scaffolding for eventual Kubernetes/Terraform adoption.
- **TypeScript Monorepo:** pnpm workspaces + Turborepo; consistent tooling (ESLint, Prettier, Vitest) across apps and packages.

---

## Architecture Overview

### High-Level Flow
1. Master bot logs into Discord, registers (or will register) slash commands, and receives user interactions.
2. Requests are validated against shared schemas (`@anankor/schemas`).
3. Jobs are enqueued onto Redis Streams with idempotency keys persisted in DynamoDB.
4. Worker fleet instances (one container per Discord token) consume jobs, execute the relevant handler, and interact with Lavalink/Discord APIs.
5. Telemetry (metrics + traces + structured logs) is emitted throughout the pipeline.

### Major Services
- **Master:** API edge, command router, job producer.
- **Workers:** Job consumers, Lavalink clients, stateful music executors.
- **Redis:** Stream storage, token claims, caching.
- **DynamoDB:** Idempotency records, guild -> worker assignments.
- **Lavalink:** Off-process audio playback engine.
- **OTEL Collector + Prometheus + Grafana:** Observability pipeline.

The repository enforces separation between orchestration (master) and execution (workers) to support horizontal scaling and fault isolation. Workers can crash independently without disturbing the master; token claims automatically fail over.

---

## Repository Layout
```
anankor/
├─ apps/
│  ├─ master/
│  │  ├─ src/
│  │  │  ├─ bot/
│  │  │  ├─ commands/
│  │  │  ├─ interactions/
│  │  │  ├─ workflows/
│  │  │  ├─ jobs/
│  │  │  ├─ http/
│  │  │  ├─ middleware/
│  │  │  ├─ services/
│  │  │  ├─ metrics/
│  │  │  ├─ index.ts
│  │  │  └─ env.ts
│  │  ├─ Dockerfile
│  │  └─ README.md
│  └─ worker/
│     ├─ src/
│     │  ├─ bot/
│     │  ├─ lavalink/
│     │  ├─ consumers/
│     │  ├─ handlers/
│     │  ├─ schedulers/
│     │  ├─ services/
│     │  ├─ metrics/
│     │  ├─ index.ts
│     │  └─ env.ts
│     ├─ Dockerfile
│     └─ README.md
├─ packages/
│  ├─ core/
│  ├─ config/
│  ├─ logger/
│  ├─ telemetry/
│  ├─ discord/
│  ├─ ipc/
│  ├─ storage/
│  ├─ music/
│  └─ schemas/
├─ infra/
│  ├─ docker/
│  │  ├─ docker-compose.yaml
│  │  ├─ .env.example
│  │  ├─ lavalink/
│  │  ├─ prometheus/
│  │  ├─ grafana/
│  │  ├─ dynamodb/
│  │  ├─ redis/
│  │  └─ otel-collector/
│  ├─ k8s/
│  └─ terraform/
├─ scripts/
│  ├─ dev.sh
│  ├─ count-worker-tokens.sh
│  └─ ci/
├─ docs/
│  ├─ 01-architecture.md
│  ├─ 02-queues-and-dedupe.md
│  ├─ 03-data-models.md
│  ├─ 04-lavalink.md
│  ├─ 05-observability.md
│  └─ API_REFERENCE.md
├─ package.json
├─ pnpm-workspace.yaml
├─ turbo.json
├─ tsconfig.base.json
├─ .eslintrc.cjs
├─ .prettierrc
├─ .gitignore
└─ README.md
```

---

## Technology Stack
| Layer            | Technology                          |
|------------------|-------------------------------------|
| Language         | TypeScript (Node.js 22.21+)         |
| Package Manager  | pnpm 10.19                          |
| Monorepo Tooling | Turborepo 2.x                       |
| Discord SDK      | discord.js 14                       |
| Queueing         | Redis Streams                       |
| Persistence      | Amazon DynamoDB (Local)             |
| Music Engine     | Lavalink 4.x                        |
| Telemetry        | OpenTelemetry, Prometheus, Grafana  |
| Containers       | Docker Compose                      |

---

## Getting Started

### Prerequisites
- **Node.js** v22.21 or later (`nvm install 22.21.0` recommended).
- **pnpm** v10.19 (installed via `corepack enable`).
- **Docker & Docker Compose** (Docker Desktop or CLI >= 20.10).
- Access to Discord bot tokens (one master + N worker tokens).
- AWS credentials (local/dev values accepted for DynamoDB Local).

### Environment Variables

Copy the examples to real files and populate secrets:
```
cp .env.example .env                      # Optional; used for local non-Docker runs
cp infra/docker/.env.example infra/docker/.env
```
Key variables:
- `DISCORD_MASTER_TOKEN=...`
- `DISCORD_WORKER_TOKEN_1=...` (one per worker container)
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
- `REDIS_URL=redis://redis:6379`
- `LAVALINK_PASSWORD=...`
- `OTLP_ENDPOINT=http://otel-collector:4318`

**Important:** never commit `.env` files. All secrets are gitignored.

### Installation
```bash
pnpm install
```
This hydrates dependencies for every workspace package and generates a `pnpm-lock.yaml` if missing (leave uncommitted if this repository prefers lockfiles elsewhere).

---

## Local Development Workflows

### Running with Docker Compose
Spin up the full stack, including Redis, Lavalink, Prometheus, Grafana, OTEL collector, master, and all worker bots:
```bash
docker compose --env-file infra/docker/.env -f infra/docker/docker-compose.yaml up --build
# Optional: in another terminal, enable file-watch-triggered rebuilds
docker compose --env-file infra/docker/.env -f infra/docker/docker-compose.yaml watch
```
Workers will auto-claim tokens based on the environment variables. Logs for each service are available via:
```bash
docker compose --env-file infra/docker/.env -f infra/docker/docker-compose.yaml logs -f master
```

### Running TypeScript Apps Locally
For direct Node execution without containers:
```bash
# Master
pnpm --filter @anankor/master dev

# Specific package build
pnpm --filter @anankor/ipc build
```
Ensure `.env` is populated and Lavalink/Redis are reachable (via Docker or local installations).

### Watch Mode & Hot Reload
```bash
pnpm watch        # Runs watch scripts for all packages/apps
pnpm --filter @anankor/master watch
```
Watch mode uses TypeScript incremental builds to recompile on file changes. For containerized workflows, `docker compose watch` rebuilds the affected service automatically.

---

## Build, Test, and Lint Commands
| Command                                  | Description                                         |
|------------------------------------------|-----------------------------------------------------|
| `pnpm build`                             | Runs Turborepo build pipeline across all projects.  |
| `pnpm lint`                              | Executes ESLint with TypeScript rules.              |
| `pnpm format`                            | Applies Prettier formatting.                        |
| `pnpm test`                              | Runs Turborepo test pipeline (Vitest recommended).  |
| `pnpm dev`                               | `turbo run dev` – use for local iterative work.     |
| `pnpm watch`                             | Continuous compilation for every package.           |
| `docker compose ... up --build`          | Builds and runs containers.                         |
| `docker compose ... logs <service>`      | Streams logs from a specific service.               |
| `scripts/count-worker-tokens.sh`         | Quick count of `DISCORD_WORKER_TOKEN_*` entries.    |

---

## Packages & Apps Reference

### Shared Packages
| Package             | Purpose                                                                                       |
|---------------------|-----------------------------------------------------------------------------------------------|
| `@anankor/core`     | Generic utilities (sleep, retry, timers).                                                     |
| `@anankor/config`   | Typed environment loader (dotenv + zod schemas).                                              |
| `@anankor/logger`   | Pino logger with redaction rules and trace correlation hooks.                                 |
| `@anankor/telemetry`| Bootstraps OpenTelemetry Node SDK, sets resource attributes, wires OTLP exporters.            |
| `@anankor/discord`  | Discord interaction router utilities, to grow into command guards and reply helpers.         |
| `@anankor/ipc`      | Redis client factory, worker token claim logic, job ID utilities.                             |
| `@anankor/storage`  | DynamoDB document client setup, Redis key/stream constants.                                   |
| `@anankor/music`    | Lavalink manager wrapper, ready for player abstractions.                                      |
| `@anankor/schemas`  | Zod schemas for job payloads, events, and shared interfaces.                                  |

All packages use TypeScript build outputs (declarations included) and share `tsconfig.base.json` configuration.

### Applications
- **`@anankor/master`**: Discord gateway entrypoint. Future home for command registration, health endpoints, job producers, and HTTP hooks.
- **`@anankor/worker`**: Worker bot entrypoint. Claims a worker token, connects to Discord voice, consumes Redis Streams, and controls Lavalink players.

Each app has its own Dockerfile to enable multi-stage builds. Containers install workspace dependencies once and run `pnpm --filter ... build` before invoking Node.

---

## Infrastructure & Observability
- **Docker Compose Services:** `master`, `worker1-5`, `redis`, `dynamodb`, `lavalink`, `prometheus`, `grafana`, `otel-collector`.
- **Prometheus:** Configuration under `infra/docker/prometheus/prometheus.yml`; scrapes master and worker metrics endpoints once implemented.
- **Grafana:** Provisioning in `infra/docker/grafana/provisioning`; dashboards stored in `infra/docker/grafana/dashboards/`.
- **OTEL Collector:** Configured via `infra/docker/otel-collector/config.yaml`; exports metrics to Prometheus (port 9464) and traces to debug logs.
- **Redis:** Optional custom configuration (`infra/docker/redis/redis.conf`).
- **DynamoDB Local:** Startup script `infra/docker/dynamodb/create-tables.sh` to create required tables.

Future infrastructure placeholders exist under `infra/k8s` and `infra/terraform` for Kubernetes and Terraform rollouts.

---

## Scripts
| Script                                | Description                                                         |
|---------------------------------------|---------------------------------------------------------------------|
| `scripts/dev.sh up/down/logs`         | Wrapper around Docker Compose commands for convenience.             |
| `scripts/count-worker-tokens.sh`      | Counts worker tokens in the Compose `.env` file.                   |
| `scripts/ci/docker-build.mjs`         | Example CI entry point for building app images.                    |

All scripts are executable (`chmod +x`). Extend the `scripts/ci` directory for additional automation (linting, tests, image push).

---

## Testing Strategy
- **Unit Tests:** Use Vitest within each package/app. Place tests under `src/__tests__` or `tests/` with the naming pattern `*.test.ts`.
- **Integration Tests:** Spin up Redis and Lavalink via Docker Compose. Use setup scripts to seed DynamoDB Local and verify worker behavior.
- **Smoke Tests:** Redis CLI commands (`XADD`, `XREAD`) validate queue wiring; Discord slash commands verify command routing.
- **Coverage:** Aim for 80%+ line coverage in critical packages (`config`, `ipc`, `storage`). Expand coverage as more logic is implemented.

`pnpm test` orchestrates tests workspace-wide. Add package-specific scripts if you require specialized setups.

---

## Deployment Considerations
- **Images:** Build using the provided Dockerfiles. Tag images per environment (`anankor-master:<version>`).
- **Configuration:** Externalize secrets via environment variables or secret managers. Never bake tokens into images.
- **Scaling:** Add `DISCORD_WORKER_TOKEN_N` entries and corresponding services in Compose (or in future, scale via Kubernetes Deployments + StatefulSets).
- **Persistence:** For production DynamoDB/Redis, use managed services. Compose files are strictly for local development and CI.
- **CI/CD:** See `.github/workflows/ci.yml` for lint/build/test pipeline. Extend to include image build/push, IaC validation, etc.

---

## Troubleshooting
| Issue                                           | Resolution                                                                                                 |
|-------------------------------------------------|-------------------------------------------------------------------------------------------------------------|
| Master exits immediately                        | Ensure `.env` or `infra/docker/.env` contains `DISCORD_MASTER_TOKEN` and Discord bot is invited to guilds. |
| Workers fail to claim tokens                    | Confirm each token is unique, valid, and the bot is added to target guilds. Check Redis for claim keys.    |
| Lavalink connection errors                      | Verify `infra/docker/lavalink/application.yml` password matches `LAVALINK_PASSWORD`.                       |
| OTEL collector exits (`address already in use`) | Prometheus exporter moved to port 9464; ensure no host service is bound to that port.                      |
| Discord 401/403 errors                          | Tokens may be invalid or privileges missing; regenerate tokens and reconfigure env files.                  |
| DynamoDB table missing                          | Run `infra/docker/dynamodb/create-tables.sh` against the local endpoint.                                  |
| Build fails due to Node version                 | Confirm Node 22.21+ and pnpm 10.19+ are installed (`corepack prepare pnpm@10.19.0`).                       |

Additional details and diagrams live in the `docs/` folder.

---

## Roadmap
1. **Slash Command Registration:** Automate command sync on master boot.
2. **Job Producers/Handlers:** Implement play/pause/queue flows using Redis Streams, DynamoDB dedupe, and Lavalink integration.
3. **Health & Metrics Endpoints:** Expose `/health`, `/ready`, `/metrics` for master and worker services.
4. **Retry & DLQ Management:** Use Redis `XAUTOCLAIM` for retries, with dashboards tracking failure counts.
5. **Kubernetes Manifests:** Translate Compose setup to K8s deployment charts in `infra/k8s`.
6. **Secrets Management:** Integrate with AWS Secrets Manager or HashiCorp Vault for production secrets.
7. **Comprehensive Test Suite:** Expand unit/integration coverage and add smoke tests for deployment pipelines.

---

## Contributing Guidelines
- Read `AGENTS.md` for a condensed contributor reference.
- Fork or branch off `main`. Keep branches scoped to a single feature or fix.
- Run `pnpm lint` and `pnpm test` before pushing.
- Use descriptive commit messages (`type(scope): summary`).
- Fill out PR templates with change summary, testing evidence, and linked issues.
- Ensure Docker Compose stack starts cleanly if infrastructure changes are made.

---

## Security & Compliance
- Treat Discord tokens like passwords. Do not share in logs, issue threads, or screenshots.
- Use hashed or redacted values when inspecting token claims (`anankor:workers:claims:<sha256>`).
- Review source files for accidental secrets before committing (`git diff` + `rg` for token patterns).
- Rotate credentials regularly; update `infra/docker/.env` and regenerate worker claims accordingly.
- Apply OS and dependency updates promptly via `pnpm update` and base image upgrades.

---

## License
A formal license has not yet been added. Until then, contributions are governed by the repository maintainer’s discretion. Add a `LICENSE` file before public release.

---

For architecture deep-dives and operational diagrams, consult the `docs/` directory. Contributions that improve clarity, automation, or reliability are welcome—please open an issue or pull request to discuss substantial changes.
