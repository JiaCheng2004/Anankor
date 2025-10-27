# Repository Guidelines

## Project Structure & Module Organization
- Root uses pnpm workspaces and Turborepo; shared packages live under `packages/`, apps under `apps/master` and `apps/worker`, and infrastructure in `infra/docker`.
- TypeScript sources follow the layout described in `docs/`—stick to the predefined folders (e.g., `apps/master/src/commands`, `packages/ipc/src`).
- Generated artifacts (`dist/`, `coverage/`, `infra/docker/docker-compose.generated.yaml`) are ignored; do not commit them.

## Build, Test, and Development Commands
- `pnpm install`: hydrate dependencies across the workspace.
- `pnpm build`: run Turborepo build pipeline for all packages/apps.
- `pnpm dev`/`pnpm watch`: run development/watch tasks in parallel.
- `docker compose --env-file infra/docker/.env -f infra/docker/docker-compose.yaml up --build`: launch the full local stack.

## Coding Style & Naming Conventions
- TypeScript with strict settings (Node16 module resolution). Use named exports and prefer camelCase for variables/functions, PascalCase for types/classes.
- Run `pnpm lint` and `pnpm format` (ESLint + Prettier) before pushing. Keep files ASCII unless a dependency demands otherwise.
- One command or helper per file is encouraged in `packages/*` to maintain clarity.

## Testing Guidelines
- Unit tests should use Vitest (wire under each package’s `tests/` folder). Name files `*.test.ts`.
- Integration tests can target `scripts/` or `infra/` helpers and should document required services.
- Run `pnpm test` to execute the Turborepo test pipeline.

## Commit & Pull Request Guidelines
- Use conventional, descriptive commit messages (e.g., `feat(worker): add lavalink heartbeat`). Squash noisy fixups.
- PRs should mention motivation, list key changes, and reference tracking issues. Include screenshots or log snippets when changing ops or observability.
- Ensure CI (GitHub Actions) passes before requesting review; attach telemetry or docker-compose notes if configuration changes.

## Security & Configuration Tips
- Never commit `.env` files; use `.env.example` variants instead.
- Redact Discord tokens and AWS secrets in logs. Hash tokens whenever they appear in Redis keys or diagnostics.
- Rotate worker tokens promptly and update `infra/docker/.env` before scaling containers.
