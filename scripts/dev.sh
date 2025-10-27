#!/usr/bin/env bash
set -euo pipefail

COMMAND=${1:-up}
shift || true

case "$COMMAND" in
  up)
    docker compose --env-file infra/docker/.env -f infra/docker/docker-compose.yaml up --build "$@"
    ;;
  down)
    docker compose --env-file infra/docker/.env -f infra/docker/docker-compose.yaml down "$@"
    ;;
  logs)
    docker compose --env-file infra/docker/.env -f infra/docker/docker-compose.yaml logs -f "$@"
    ;;
  *)
    echo "Unknown command: $COMMAND" >&2
    exit 1
    ;;
esac
