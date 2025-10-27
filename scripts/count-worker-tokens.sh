#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=${1:-infra/docker/.env}

grep -E '^DISCORD_WORKER_TOKEN_[0-9]+=' "$ENV_FILE" | wc -l
