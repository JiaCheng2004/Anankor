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

## Plugin Stack

We load two first-party plugins to extend Lavaplayer v4:

- `dev.lavalink.youtube:youtube-plugin` replaces the deprecated builtin YouTube source. The plugin must run with the builtin YouTube source disabled and should be paired with a cipher resolver to keep up with signature changes.
- `com.github.topi314.lavasrc:lavasrc-plugin` mirrors Spotify, Apple Music, and similar catalogues onto playable providers like Deezer or yt-dlp. The plugin injects enhanced track metadata (album art, preview URLs) that workers can surface in embeds.

### Youtube Source extras

- Remote cipher resolution is mandatory for long-term stability. We deploy [`yt-cipher`](https://github.com/kikkia/yt-cipher) in Docker and point the plugin at `YOUTUBE_REMOTE_CIPHER_URL`, `YOUTUBE_REMOTE_CIPHER_PASSWORD`, and `YOUTUBE_REMOTE_CIPHER_USER_AGENT`.
- Optional OAuth and `poToken` flows stay disabled by default, but the REST endpoints exposed by youtube-source remain available at `/youtube` if we ever need a runtime refresh token.
- Client ordering matters: favour robust streaming clients (`ANDROID_VR`, `WEB`, `WEBEMBEDDED`) and keep `MUSIC` last to avoid search-only fallbacks blocking playback.

### LavaSrc extras

- Spotify: requires `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and `SPOTIFY_COUNTRY_CODE`. Set `SPOTIFY_SP_DC` if we want lyrics from LavaLyrics or anonymous token acquisition.
- Apple Music: uses `APPLE_MUSIC_MEDIA_API_TOKEN` and `APPLE_MUSIC_COUNTRY_CODE`. If we later move to private key auth, the config already exposes `keyID`, `teamID`, and `musicKitKey`.
- Mirrored playback relies on at least one direct provider. We favour the YouTube search fallbacks so youtube-source remains the final delivery path.
- Non-configured catalogues remain disabled; fill in the matching environment variables when contracts permit (e.g. Deezer `ARL`, Tidal token).

### Service Overview

- `lavalink` keeps reading its configuration from `infra/docker/lavalink/application.yml`. Environment variables bubble through via Docker Compose so production secrets stay outside the repo.
- `yt-cipher` runs alongside Lavalink and exposes `/decrypt_signature`, `/get_sts`, and `/resolve_url`. Configure its `API_TOKEN` with `YTCIPHER_API_TOKEN` to protect the endpoint.
- Workers reference `LAVALINK_CLIENT_NAME=AnankorWorker` to stamp requests—keep the name aligned with `clients[].userAgent` to correlate metrics across the stack.
