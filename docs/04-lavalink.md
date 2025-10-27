# Lavalink Integration

- Lavalink runs as a sidecar container managed by Docker Compose.
- Workers connect using the `@anankor/music` package which wraps the `lavalink-client` manager.
- Reconnect logic should monitor node health, resume or recreate players, and surface metrics for connection status and request latency.
- Secrets (password) are injected via the Compose `.env` file; never log raw credentials.
