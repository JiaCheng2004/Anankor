# Lavalink Integration

Music playback remains one of the two pillars of the project alongside cooperative game sessions. The notes below focus on the audio path specifically.

- Lavalink runs as a sidecar container managed by Docker Compose.
- Workers connect using the `@anankor/music` package which wraps the `lavalink-client` manager.
- Reconnect logic should monitor node health, resume or recreate players, and surface metrics for connection status and request latency.
- Secrets (password) are injected via the Compose `.env` file; never log raw credentials.

## Worker Configuration

Workers discover Lavalink nodes via environment variables loaded in `loadWorkerConfig()`:

- `LAVALINK_PASSWORD` is required and should match the server-side password.
- `LAVALINK_HOST`, `LAVALINK_PORT`, and `LAVALINK_SECURE` default to `lavalink`, `2333`, and `false` but can be overridden per environment.
- `LAVALINK_NODES` accepts a JSON array of nodes (`[{ "id": "node-1", "host": "...", "port": 2333, "password": "...", "secure": false }]`) for multi-node deployments.
- `LAVALINK_CLIENT_NAME` customises the identifier sent with REST calls, useful for tracing cross-service requests.
- Each worker processes one `sessionKey = guildId/voiceChannelId` at a time; it should reject new playback instructions if already bound, forcing the master to uphold affinity. On disconnect or fatal Lavalink errors, the worker emits a failure event so the master can clear the binding and notify users to rerun `/play`.
