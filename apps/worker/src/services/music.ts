import {
  escapeMarkdown,
  type Client,
  type MessageCreateOptions,
  type TextBasedChannel,
} from 'discord.js';
import { createLavalinkManager } from '@anankor/music';
import type { LavalinkNodeConfig, WorkerConfig } from '@anankor/config';
import type { createLogger } from '@anankor/logger';
import type {
  CommandRequester,
  GuildCommandJobBase,
  MusicPauseJob,
  MusicPlayJob,
  MusicQueueJob,
  MusicResumeJob,
  MusicSkipJob,
  MusicStopJob,
  MusicVolumeJob,
} from '@anankor/schemas';

type SupportedMusicJob =
  | MusicPlayJob
  | MusicPauseJob
  | MusicResumeJob
  | MusicSkipJob
  | MusicStopJob
  | MusicQueueJob
  | MusicVolumeJob;

interface MusicResponse {
  handled: boolean;
  payload?: MessageCreateOptions;
}

interface LavalinkTrackLike {
  encoded?: string;
  track?: string;
  info?: {
    identifier?: string;
    title?: string;
    author?: string;
    uri?: string;
    length?: number;
    artworkUrl?: string;
    isStream?: boolean;
  } & Record<string, unknown>;
  [key: string]: unknown;
}

interface LavalinkPlayerLike {
  guildId?: string;
  voiceChannelId?: string | null;
  textChannelId?: string | null;
  playing?: boolean;
  paused?: boolean;
  volume?: number;
  queue?: {
    current?: LavalinkTrackLike | null;
    tracks?: LavalinkTrackLike[];
    length?: number;
    size?: number;
    add?: (tracks: LavalinkTrackLike | LavalinkTrackLike[]) => void;
    clear?: () => void;
    remove?: (position: number) => LavalinkTrackLike | undefined;
  };
  connect?: (voiceChannelId?: string, options?: Record<string, unknown>) => Promise<void> | void;
  disconnect?: () => Promise<void> | void;
  destroy?: () => Promise<void> | void;
  play?: (
    trackOrOptions?: LavalinkTrackLike | LavalinkPlayPayload | Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => Promise<void> | void;
  start?: (track: LavalinkTrackLike, options?: Record<string, unknown>) => Promise<void> | void;
  stop?: () => Promise<void> | void;
  pause?: (paused?: boolean) => Promise<void> | void;
  resume?: () => Promise<void> | void;
  skip?: (to?: number) => Promise<void> | void;
  setVolume?: (volume: number) => Promise<void> | void;
  [key: string]: unknown;
}

interface LavalinkManagerLike {
  connect?: () => Promise<void> | void;
  updateVoiceState?: (data: unknown) => void;
  createPlayer?: (...args: unknown[]) => LavalinkPlayerLike;
  getPlayer?: (guildId: string) => LavalinkPlayerLike | undefined;
  destroyPlayer?: (guildId: string) => void;
  players?: Map<string, LavalinkPlayerLike> | Record<string, LavalinkPlayerLike>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  off?: (event: string, listener: (...args: unknown[]) => void) => void;
  once?: (event: string, listener: (...args: unknown[]) => void) => void;
  nodeManager?: {
    connectAll?: () => Promise<number> | number;
    nodes?: Map<string, unknown> | Record<string, unknown>;
  } & Record<string, unknown>;
  [key: string]: unknown;
}

interface LavalinkNodeLike {
  id?: string;
  connected?: boolean | string;
  sessionId?: string;
  [key: string]: unknown;
}

type QueueEntry = {
  track: LavalinkTrackLike;
  requestedBy: CommandRequester;
  enqueuedAt: number;
};

type LavalinkPlayPayload = {
  track: {
    encoded?: string;
    identifier?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

interface GuildPlaybackState {
  player: LavalinkPlayerLike;
  voiceChannelId: string;
  textChannelId: string;
  queue: QueueEntry[];
  current: QueueEntry | null;
  paused: boolean;
  volume?: number;
}

interface TrackLoadResult {
  loadType: string;
  tracks: LavalinkTrackLike[];
  playlistName?: string;
  selectedTrackIndex?: number;
}

const MAX_QUEUE_LINES = 10;
const MS_IN_SECOND = 1000;
const SECONDS_IN_MINUTE = 60;

export class MusicPlaybackService {
  private readonly logger: ReturnType<typeof createLogger>;
  private readonly nodes: LavalinkNodeConfig[];
  private readonly clientName: string;
  private readonly guildStates = new Map<string, GuildPlaybackState>();

  private manager: LavalinkManagerLike | null = null;
  private managerReady = false;
  private managerReadyPromise: Promise<void> = Promise.resolve();
  private managerReadyResolve: (() => void) | null = null;
  private managerReadyReject: ((error: unknown) => void) | null = null;
  private managerInitialising = false;

  private readonly rawListener: (packet: unknown) => void;
  private readonly onTrackEndListener = (...args: unknown[]): void => {
    const [player, track, payload] = args as [LavalinkPlayerLike, LavalinkTrackLike, unknown?];
    void this.handleTrackEnd(player, track, payload);
  };
  private readonly onTrackStartListener = (...args: unknown[]): void => {
    const [player, track] = args as [LavalinkPlayerLike, LavalinkTrackLike];
    void this.handleTrackStart(player, track);
  };
  private readonly onNodeConnectListener = (...args: unknown[]): void => {
    const [node] = args;
    this.logger.info({ node }, 'Lavalink node connected');
  };
  private readonly onNodeDisconnectListener = (...args: unknown[]): void => {
    const [node, event] = args;
    this.logger.warn({ node, event }, 'Lavalink node disconnected');
  };
  private readonly onNodeErrorListener = (...args: unknown[]): void => {
    const [node, error] = args;
    this.logger.error({ node, err: error }, 'Lavalink node error');
  };
  private readonly onManagerErrorListener = (...args: unknown[]): void => {
    const [error] = args;
    this.logger.error({ err: error }, 'Lavalink manager emitted error');
  };
  private readonly onNodeManagerErrorListener = (...args: unknown[]): void => {
    const [error] = args;
    this.logger.error({ err: error }, 'Lavalink node manager error');
  };

  constructor(
    private readonly client: Client,
    workerConfig: WorkerConfig,
    logger: ReturnType<typeof createLogger>,
  ) {
    this.logger = logger.child({ scope: 'music' });
    this.nodes = workerConfig.lavalink.nodes;
    this.clientName = workerConfig.lavalink.clientName;

    this.resetManagerReadyPromise();

    this.rawListener = (packet: unknown) => {
      this.manager?.updateVoiceState?.(packet);
    };
    this.client.on('raw', this.rawListener);
  }

  private resetManagerReadyPromise(): void {
    this.managerReadyPromise = new Promise<void>((resolve, reject) => {
      this.managerReadyResolve = resolve;
      this.managerReadyReject = reject;
    });
  }

  public async onClientReady(): Promise<void> {
    if (this.managerReady && this.manager) {
      return;
    }

    if (this.managerInitialising) {
      await this.managerReadyPromise;
      return;
    }

    if (!this.client.isReady()) {
      await this.managerReadyPromise;
      return;
    }

    this.managerInitialising = true;

    try {
      const managerConfig = {
        nodes: this.nodes,
        shards: this.client.ws.shards.size || 1,
        userId: this.client.user?.id,
        client: this.client.user
          ? {
              id: this.client.user.id,
              username: this.client.user.username,
            }
          : undefined,
        sendToShard: (guildId: string, payload: unknown) => this.sendPayloadToGuild(guildId, payload),
        send: (guildOrPacket: unknown, maybePacket?: unknown) => this.forwardGatewayPayload(guildOrPacket, maybePacket),
        clientName: this.clientName,
      };

      const manager = (await createLavalinkManager(managerConfig)) as LavalinkManagerLike;

      this.manager = manager;

      if (typeof manager.on === 'function') {
        manager.on('trackEnd', this.onTrackEndListener);
        manager.on('trackStart', this.onTrackStartListener);
        manager.on('nodeConnect', this.onNodeConnectListener);
        manager.on('nodeDisconnect', this.onNodeDisconnectListener);
        manager.on('nodeError', this.onNodeErrorListener);
        manager.on('error', this.onManagerErrorListener);
      }

      if (manager.nodeManager && typeof manager.nodeManager.on === 'function') {
        manager.nodeManager.on('error', this.onNodeManagerErrorListener);
      }

      try {
        await Promise.resolve(manager.connect?.());
      } catch (error) {
        this.logger.error({ err: error }, 'Failed to connect Lavalink manager');
      }

      if (typeof manager.nodeManager?.connectAll === 'function') {
        try {
          const connected = await manager.nodeManager.connectAll();
          const totalNodes = manager.nodeManager.nodes?.size ?? 0;
          this.logger.info({ connectedNodes: connected, totalNodes }, 'Initialised Lavalink node connections');
        } catch (error) {
          this.logger.error({ err: error }, 'Failed to connect all Lavalink nodes');
        }
      }

      await this.awaitNodeAvailability(manager);

      this.managerReady = true;
      this.managerReadyResolve?.();
    } catch (error) {
      this.managerReady = false;
      this.manager = null;
      this.managerReadyReject?.(error);
      this.resetManagerReadyPromise();
      this.logger.error({ err: error }, 'Failed to initialise Lavalink manager');
      throw error;
    } finally {
      this.managerInitialising = false;
    }
  }

  public async handle(job: GuildCommandJobBase, _channel: TextBasedChannel): Promise<MusicResponse> {
    if (!isSupportedMusicJob(job)) {
      return { handled: false };
    }

    try {
      switch (job.type) {
        case 'music.play':
          return await this.handlePlay(job);
        case 'music.pause':
          return await this.handlePause(job);
        case 'music.resume':
          return await this.handleResume(job);
        case 'music.skip':
          return await this.handleSkip(job);
        case 'music.stop':
          return await this.handleStop(job);
        case 'music.queue':
          return await this.handleQueue(job);
        case 'music.volume':
          return await this.handleVolume(job);
        default:
          return { handled: false };
      }
    } catch (error) {
      this.logger.error({ err: error, jobType: job.type, guildId: job.guildId }, 'Music job handler threw error');
      return {
        handled: true,
        payload: {
          content: 'Something went wrong while handling that music request. Please try again shortly.',
        },
      };
    }
  }

  public async shutdown(): Promise<void> {
    this.client.off('raw', this.rawListener);

    for (const [guildId, state] of this.guildStates.entries()) {
      await this.destroyPlayer(state.player, guildId).catch((error) => {
        this.logger.warn({ err: error, guildId }, 'Failed to destroy player during shutdown');
      });
      this.guildStates.delete(guildId);
    }

    if (this.manager && typeof this.manager.off === 'function') {
      this.manager.off('trackEnd', this.onTrackEndListener);
      this.manager.off('trackStart', this.onTrackStartListener);
      this.manager.off('nodeConnect', this.onNodeConnectListener);
      this.manager.off('nodeDisconnect', this.onNodeDisconnectListener);
      this.manager.off('nodeError', this.onNodeErrorListener);
      this.manager.off('error', this.onManagerErrorListener);
    }

    if (this.manager?.nodeManager && typeof this.manager.nodeManager.off === 'function') {
      this.manager.nodeManager.off('error', this.onNodeManagerErrorListener);
    }

    this.manager = null;
    this.managerReady = false;
    this.resetManagerReadyPromise();
  }

  private async handlePlay(job: MusicPlayJob): Promise<MusicResponse> {
    await this.ensureReady();

    if (!job.voiceChannelId) {
      return {
        handled: true,
        payload: {
          content: 'You need to join a voice channel before requesting music.',
        },
      };
    }

    const state = await this.getOrCreateGuildState(job.guildId, job.voiceChannelId, job.textChannelId);
    const loadResult = await this.loadTracks(job.query);

    if (loadResult.tracks.length === 0) {
      return {
        handled: true,
        payload: {
          content: `I could not find any tracks for **${escapeMarkdown(job.query)}**.`,
        },
      };
    }

    let resolvedTracks = loadResult.tracks;
    if (loadResult.loadType === 'search' && resolvedTracks.length > 0) {
      resolvedTracks = [resolvedTracks[0]];
    }
    if (
      typeof loadResult.selectedTrackIndex === 'number' &&
      loadResult.selectedTrackIndex >= 0 &&
      loadResult.selectedTrackIndex < loadResult.tracks.length
    ) {
      const { selectedTrackIndex } = loadResult;
      resolvedTracks = [
        ...loadResult.tracks.slice(selectedTrackIndex),
        ...loadResult.tracks.slice(0, selectedTrackIndex),
      ];
    }

    const entries = resolvedTracks.map((track) => this.buildQueueEntry(track, job.requester));
    state.queue.push(...entries);
    state.textChannelId = job.textChannelId;
    await this.ensurePlayerConnected(state, job.voiceChannelId);

    const wasIdle = state.current === null;
    const queuedCount = entries.length;

    if (wasIdle) {
      const started = await this.startNextTrack(job.guildId, state);
      if (!started) {
        return {
          handled: true,
          payload: {
            content: 'Failed to start playback for the requested track.',
          },
        };
      }

      const nowPlaying = state.current;
      const content = nowPlaying
        ? `▶️ Now playing **${formatTrackTitle(nowPlaying.track)}** (requested by <@${nowPlaying.requestedBy.userId}>).`
        : '▶️ Starting playback.';

      this.logger.info(
        {
          guildId: job.guildId,
          voiceChannelId: job.voiceChannelId,
          textChannelId: job.textChannelId,
          queueSize: state.queue.length,
          playlist: loadResult.playlistName ?? null,
          queuedCount,
          requesterId: job.requester.userId,
        },
        'Started playback for music.play job',
      );

      return { handled: true, payload: { content } };
    }

    const firstQueued = entries[0];
    let content = `➕ Added **${formatTrackTitle(firstQueued.track)}** to the queue.`;
    if (queuedCount > 1) {
      content += ` (${queuedCount} tracks queued)`;
    }

    if (loadResult.playlistName) {
      content += ` — playlist **${escapeMarkdown(loadResult.playlistName)}**`;
    }

    this.logger.info(
      {
        guildId: job.guildId,
        queuedCount,
        queueSize: state.queue.length,
        playlist: loadResult.playlistName ?? null,
        requesterId: job.requester.userId,
      },
      'Enqueued additional tracks for music.play job',
    );

    return { handled: true, payload: { content } };
  }

  private async handlePause(job: MusicPauseJob): Promise<MusicResponse> {
    await this.ensureReady();

    const state = this.guildStates.get(job.guildId);
    if (!state || (!state.current && state.queue.length === 0)) {
      return {
        handled: true,
        payload: { content: 'There is nothing playing right now.' },
      };
    }

    if (state.paused) {
      return {
        handled: true,
        payload: { content: 'Playback is already paused.' },
      };
    }

    await this.pausePlayer(state.player, true);
    state.paused = true;

    this.logger.info({ guildId: job.guildId }, 'Paused playback');

    return {
      handled: true,
      payload: { content: '⏸️ Paused the current track.' },
    };
  }

  private async handleResume(job: MusicResumeJob): Promise<MusicResponse> {
    await this.ensureReady();

    const state = this.guildStates.get(job.guildId);
    if (!state || (!state.current && state.queue.length === 0)) {
      return { handled: true, payload: { content: 'There is nothing queued to resume.' } };
    }

    if (!state.paused && isPlayerPlaying(state.player)) {
      return { handled: true, payload: { content: 'Playback is already running.' } };
    }

    await this.pausePlayer(state.player, false);
    state.paused = false;

    this.logger.info({ guildId: job.guildId }, 'Resumed playback');

    return { handled: true, payload: { content: '▶️ Resumed playback.' } };
  }

  private async handleSkip(job: MusicSkipJob): Promise<MusicResponse> {
    await this.ensureReady();

    const state = this.guildStates.get(job.guildId);
    if (!state || (!state.current && state.queue.length === 0)) {
      return { handled: true, payload: { content: 'There is nothing to skip.' } };
    }

    const count = Math.max(1, job.count ?? 1);
    const skippedTracks: QueueEntry[] = [];

    if (count > 1 && state.queue.length > 0) {
      const removeCount = Math.min(count - 1, state.queue.length);
      const removed = state.queue.splice(0, removeCount);
      skippedTracks.push(...removed);
    }

    const previousTrack = state.current;
    await this.stopPlayer(state.player);
    state.current = null;
    state.paused = false;

    const started = await this.startNextTrack(job.guildId, state);

    this.logger.info(
      {
        guildId: job.guildId,
        skippedCount: count,
        removedFromQueue: skippedTracks.length,
        previousTrack: previousTrack ? formatTrackTitle(previousTrack.track) : null,
        requesterId: job.requester.userId,
      },
      'Skipped tracks',
    );

    if (!started) {
      return {
        handled: true,
        payload: { content: '⏭️ Skipped the current track. The queue is now empty.' },
      };
    }

    const candidateEntry = state.current;
    let content: string;
    if (candidateEntry && 'requestedBy' in candidateEntry && 'track' in candidateEntry) {
      const entry = candidateEntry as QueueEntry;
      const requesterId = entry.requestedBy.userId;
      content = `⏭️ Skipped to **${formatTrackTitle(entry.track)}** (requested by <@${requesterId}>).`;
    } else {
      content = '⏭️ Skipped the current track.';
    }

    return { handled: true, payload: { content } };
  }

  private async handleStop(job: MusicStopJob): Promise<MusicResponse> {
    await this.ensureReady();

    const state = this.guildStates.get(job.guildId);
    if (!state) {
      return { handled: true, payload: { content: 'There is nothing playing right now.' } };
    }

    await this.stopPlayer(state.player);
    await this.destroyPlayer(state.player, job.guildId);

    this.guildStates.delete(job.guildId);

    this.logger.info({ guildId: job.guildId, requesterId: job.requester.userId }, 'Stopped playback and destroyed player');

    return {
      handled: true,
      payload: { content: '⏹️ Stopped playback and cleared the queue.' },
    };
  }

  private async handleQueue(job: MusicQueueJob): Promise<MusicResponse> {
    const state = this.guildStates.get(job.guildId);
    if (!state || (!state.current && state.queue.length === 0)) {
      return { handled: true, payload: { content: 'The queue is currently empty.' } };
    }

    const lines: string[] = [];

    const candidateEntry = state.current;
    if (candidateEntry && 'requestedBy' in candidateEntry && 'track' in candidateEntry) {
      const entry = candidateEntry as QueueEntry;
      const requesterId = entry.requestedBy.userId;
      lines.push(`**Now playing:** ${formatTrackTitle(entry.track)} — requested by <@${requesterId}>`);
    } else {
      lines.push('Nothing is currently playing.');
    }

    if (state.queue.length > 0) {
      lines.push('');
      lines.push('**Up next:**');
      const upcoming = state.queue.slice(0, MAX_QUEUE_LINES);
      upcoming.forEach((entry, index) => {
        lines.push(`${index + 1}. ${formatTrackTitle(entry.track)} — <@${entry.requestedBy.userId}>`);
      });
      if (state.queue.length > MAX_QUEUE_LINES) {
        lines.push(`…and ${state.queue.length - MAX_QUEUE_LINES} more.`);
      }
    }

    return {
      handled: true,
      payload: { content: lines.join('\n') },
    };
  }

  private async handleVolume(job: MusicVolumeJob): Promise<MusicResponse> {
    await this.ensureReady();

    const state = this.guildStates.get(job.guildId);
    if (!state || (!state.current && state.queue.length === 0)) {
      return { handled: true, payload: { content: 'There is nothing playing right now.' } };
    }

    if (typeof job.level !== 'number') {
      const currentVolume = this.resolvePlayerVolume(state);
      const content =
        currentVolume !== undefined ? `🔊 Current volume is **${currentVolume}%**.` : '🔊 Volume level is unknown right now.';
      return { handled: true, payload: { content } };
    }

    await this.setPlayerVolume(state.player, job.level);
    state.volume = job.level;

    this.logger.info({ guildId: job.guildId, volume: job.level }, 'Adjusted playback volume');

    return {
      handled: true,
      payload: { content: `🔊 Set volume to **${job.level}%**.` },
    };
  }

  private async ensureReady(): Promise<void> {
    if (this.managerReady && this.manager) {
      return;
    }

    if (this.client.isReady() && !this.managerInitialising) {
      await this.onClientReady();
    }

    await this.managerReadyPromise;

    if (!this.manager) {
      throw new Error('Lavalink manager is not initialised');
    }
  }

  private async awaitNodeAvailability(manager: LavalinkManagerLike): Promise<void> {
    const MAX_WAIT_MS = 5_000;
    const POLL_INTERVAL_MS = 250;

    const start = Date.now();
    while (Date.now() - start < MAX_WAIT_MS) {
      const nodes = this.collectNodes(manager);
      if (nodes.length > 0) {
        const ready = nodes.some((node) => this.isNodeReady(node));
        if (ready) {
          return;
        }
        this.logger.debug(
          nodes.map((node) => this.describeNodeState(node)),
          'Lavalink nodes present but not yet ready',
        );
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    this.logger.warn('Lavalink nodes did not report ready status within timeout window');
  }

  private collectNodes(manager: LavalinkManagerLike): LavalinkNodeLike[] {
    const nodes: LavalinkNodeLike[] = [];
    const rawNodes = manager.nodeManager?.nodes;
    if (rawNodes instanceof Map) {
      for (const node of rawNodes.values()) {
        nodes.push(node as LavalinkNodeLike);
      }
    } else if (rawNodes && typeof rawNodes === 'object') {
      for (const value of Object.values(rawNodes)) {
        nodes.push(value as LavalinkNodeLike);
      }
    }
    return nodes;
  }

  private isNodeReady(node: LavalinkNodeLike): boolean {
    const connected = (node as { connected?: boolean | string }).connected;
    if (typeof connected === 'boolean') {
      return connected;
    }

    if (typeof connected === 'string' && connected.length > 0) {
      const normalised = connected.toLowerCase();
      if (normalised === 'connected' || normalised === 'ready') {
        return true;
      }
    }

    const isAlive = (node as { isAlive?: boolean }).isAlive;
    if (typeof isAlive === 'boolean') {
      return isAlive;
    }

    const sessionId = (node as { sessionId?: string | null }).sessionId;
    if (typeof sessionId === 'string' && sessionId.trim().length > 0) {
      return true;
    }

    const state = (node as { state?: string; status?: string }).state ?? (node as { status?: string }).status;
    if (typeof state === 'string' && state.length > 0) {
      const normalised = state.toLowerCase();
      return normalised === 'connected' || normalised === 'ready';
    }

    return false;
  }

  private describeNodeState(node: LavalinkNodeLike): Record<string, unknown> {
    return {
      id: (node as { id?: unknown }).id ?? null,
      connected: (node as { connected?: unknown }).connected ?? null,
      isAlive: (node as { isAlive?: unknown }).isAlive ?? null,
      sessionId: (node as { sessionId?: unknown }).sessionId ?? null,
      state: (node as { state?: unknown }).state ?? null,
      status: (node as { status?: unknown }).status ?? null,
    };
  }

  private async getOrCreateGuildState(
    guildId: string,
    voiceChannelId: string,
    textChannelId: string,
  ): Promise<GuildPlaybackState> {
    const existing = this.guildStates.get(guildId);
    if (existing) {
      existing.textChannelId = textChannelId;
      if (existing.voiceChannelId !== voiceChannelId) {
        await this.ensurePlayerConnected(existing, voiceChannelId);
      }
      return existing;
    }

    const manager = this.manager;
    if (!manager) {
      throw new Error('Lavalink manager is not initialised');
    }

    let player = this.resolvePlayer(manager, guildId);
    if (!player) {
      player = this.createPlayer(manager, guildId, voiceChannelId, textChannelId);
    }

    const initialVolume =
      typeof (player as { volume?: unknown }).volume === 'number'
        ? (player as { volume: number }).volume
        : undefined;

    const state: GuildPlaybackState = {
      player,
      voiceChannelId,
      textChannelId,
      queue: [],
      current: null,
      paused: false,
      volume: initialVolume,
    };

    this.guildStates.set(guildId, state);
    await this.ensurePlayerConnected(state, voiceChannelId);

    return state;
  }

  private resolvePlayer(manager: LavalinkManagerLike, guildId: string): LavalinkPlayerLike | null {
    if (manager.players instanceof Map) {
      const player = manager.players.get(guildId);
      if (player) {
        return player;
      }
    } else if (manager.players && typeof manager.players === 'object') {
      const record = manager.players as Record<string, LavalinkPlayerLike>;
      if (record[guildId]) {
        return record[guildId];
      }
    }

    if (typeof manager.getPlayer === 'function') {
      const player = manager.getPlayer(guildId);
      if (player) {
        return player;
      }
    }

    return null;
  }

  private createPlayer(
    manager: LavalinkManagerLike,
    guildId: string,
    voiceChannelId: string,
    textChannelId: string,
  ): LavalinkPlayerLike {
    if (typeof manager.createPlayer !== 'function') {
      throw new Error('Lavalink manager does not expose createPlayer');
    }

    let player: LavalinkPlayerLike | undefined;
    try {
      player = manager.createPlayer({
        guildId,
        voiceChannelId,
        textChannelId,
        selfDeaf: true,
        deafened: true,
      });
    } catch (error) {
      this.logger.warn(
        { guildId, err: error },
        'Failed to create player with option object, attempting legacy signature',
      );
    }

    if (!player) {
      player = manager.createPlayer(guildId);
    }

    if (!player) {
      throw new Error('Failed to create Lavalink player');
    }

    return player;
  }

  private async ensurePlayerConnected(state: GuildPlaybackState, voiceChannelId: string): Promise<void> {
    if (!voiceChannelId) {
      return;
    }

    const player = state.player;
    const currentChannel = typeof player.voiceChannelId === 'string' ? player.voiceChannelId : null;
    const playerOptions = (player as { options?: { voiceChannelId?: string; selfDeaf?: boolean; selfMute?: boolean } }).options;
    if (playerOptions) {
      playerOptions.voiceChannelId = voiceChannelId;
      playerOptions.selfDeaf = true;
      playerOptions.selfMute = false;
    }

    if (currentChannel === voiceChannelId) {
      state.voiceChannelId = voiceChannelId;
      return;
    }

    const connectOptions = { voiceChannelId, selfDeaf: true, selfMute: false };

    if (!currentChannel) {
      if (typeof player.connect === 'function') {
        try {
          await Promise.resolve(player.connect());
        } catch (error) {
          this.logger.warn({ err: error, guildId: state.player.guildId ?? state.voiceChannelId }, 'player.connect() failed, attempting fallback');
          if (typeof (player as { changeVoiceState?: (data: typeof connectOptions) => Promise<void> | void }).changeVoiceState === 'function') {
            await Promise.resolve(
              (player as { changeVoiceState: (data: typeof connectOptions) => Promise<void> | void }).changeVoiceState(
                connectOptions,
              ),
            );
          } else if (typeof (player as { join?: (id: string) => Promise<void> | void }).join === 'function') {
            await Promise.resolve((player as { join: (id: string) => Promise<void> | void }).join(voiceChannelId));
          }
        }
      } else if (typeof (player as { changeVoiceState?: (data: typeof connectOptions) => Promise<void> | void }).changeVoiceState === 'function') {
        await Promise.resolve(
          (player as { changeVoiceState: (data: typeof connectOptions) => Promise<void> | void }).changeVoiceState(connectOptions),
        );
      } else if (typeof (player as { join?: (id: string) => Promise<void> | void }).join === 'function') {
        await Promise.resolve((player as { join: (id: string) => Promise<void> | void }).join(voiceChannelId));
      }
    } else if (typeof (player as { changeVoiceState?: (data: typeof connectOptions) => Promise<void> | void }).changeVoiceState === 'function') {
      await Promise.resolve(
        (player as { changeVoiceState: (data: typeof connectOptions) => Promise<void> | void }).changeVoiceState(connectOptions),
      );
    } else if (typeof player.connect === 'function') {
      await Promise.resolve(player.connect());
    } else if (typeof (player as { join?: (id: string) => Promise<void> | void }).join === 'function') {
      await Promise.resolve((player as { join: (id: string) => Promise<void> | void }).join(voiceChannelId));
    }

    state.voiceChannelId = voiceChannelId;
  }

  private async playTrack(player: LavalinkPlayerLike, track: LavalinkTrackLike): Promise<void> {
    if (typeof player.play === 'function') {
      const playOptions = this.buildPlayOptions(track);
      if (playOptions) {
        try {
          await Promise.resolve(player.play(playOptions));
          return;
        } catch (error) {
          this.logger.debug(
            { err: error, track: formatTrackTitle(track) },
            'Player.play with options payload threw, attempting legacy signature',
          );
        }
      }

      await Promise.resolve(player.play(track));
      return;
    }

    if (typeof player.start === 'function') {
      await Promise.resolve(player.start(track));
      return;
    }

    throw new Error('Lavalink player missing play method');
  }

  private async pausePlayer(player: LavalinkPlayerLike, pause: boolean): Promise<void> {
    if (typeof player.pause === 'function') {
      await Promise.resolve(player.pause(pause));
      return;
    }

    if (!pause && typeof player.resume === 'function') {
      await Promise.resolve(player.resume());
      return;
    }

    throw new Error('Lavalink player does not support pause/resume');
  }

  private async stopPlayer(player: LavalinkPlayerLike): Promise<void> {
    if (typeof player.stop === 'function') {
      await Promise.resolve(player.stop());
      return;
    }
    await this.pausePlayer(player, true);
  }

  private async setPlayerVolume(player: LavalinkPlayerLike, volume: number): Promise<void> {
    if (typeof player.setVolume === 'function') {
      await Promise.resolve(player.setVolume(volume));
      return;
    }
    throw new Error('Lavalink player does not expose setVolume');
  }

  private resolvePlayerVolume(state: Pick<GuildPlaybackState, 'player' | 'volume'>): number | undefined {
    if (typeof state.volume === 'number') {
      return state.volume;
    }
    const rawVolume = (state.player as { volume?: unknown }).volume;
    if (typeof rawVolume === 'number') {
      return rawVolume;
    }
    return undefined;
  }

  private async destroyPlayer(player: LavalinkPlayerLike, guildId: string): Promise<void> {
    if (typeof player.disconnect === 'function') {
      await Promise.resolve(player.disconnect());
    }
    if (typeof player.destroy === 'function') {
      await Promise.resolve(player.destroy());
    }

    const manager = this.manager;
    if (!manager) {
      return;
    }

    if (typeof manager.destroyPlayer === 'function') {
      manager.destroyPlayer(guildId);
    }
  }

  private async startNextTrack(guildId: string, state: GuildPlaybackState): Promise<boolean> {
    if (state.queue.length === 0) {
      state.current = null;
      state.paused = false;
      return false;
    }

    const maxAttempts = Math.min(state.queue.length, 25);

    for (let attempt = 0; attempt <= maxAttempts; attempt += 1) {
      const nextEntry = state.queue.shift();
      if (!nextEntry) {
        break;
      }
      try {
        await this.playTrack(state.player, nextEntry.track);
        state.current = nextEntry;
        state.paused = false;
        return true;
      } catch (error) {
        this.logger.error(
          {
            err: error,
            guildId,
            attempt,
            track: formatTrackTitle(nextEntry.track),
          },
          'Failed to start queued track, attempting next entry',
        );
      }
    }

    state.current = null;
    return false;
  }

  private buildQueueEntry(track: LavalinkTrackLike, requester: CommandRequester): QueueEntry {
    return {
      track,
      requestedBy: requester,
      enqueuedAt: Date.now(),
    };
  }

  private buildPlayOptions(track: LavalinkTrackLike): LavalinkPlayPayload | null {
    const encoded = this.resolveEncodedTrack(track);
    const identifier = this.resolveTrackIdentifier(track);

    if (!encoded && !identifier) {
      return null;
    }

    const payload: LavalinkPlayPayload = {
      track: {},
    };

    if (encoded) {
      payload.track.encoded = encoded;
    }
    if (identifier) {
      payload.track.identifier = identifier;
    }

    return payload;
  }

  private resolveEncodedTrack(track: LavalinkTrackLike): string | null {
    if (track && typeof (track as { encoded?: unknown }).encoded === 'string') {
      return (track as { encoded: string }).encoded;
    }
    if (track && typeof (track as { track?: unknown }).track === 'string') {
      return (track as { track: string }).track;
    }
    return null;
  }

  private resolveTrackIdentifier(track: LavalinkTrackLike): string | null {
    const info = track && typeof track === 'object' ? (track as { info?: unknown }).info : null;
    if (info && typeof (info as { identifier?: unknown }).identifier === 'string') {
      return (info as { identifier: string }).identifier;
    }
    return null;
  }

  private async loadTracks(query: string): Promise<TrackLoadResult> {
    const node = this.nodes[0];
    if (!node) {
      throw new Error('No Lavalink nodes configured');
    }

    const identifier = looksLikeUrl(query) ? query : `ytsearch:${query}`;
    const base = `${node.secure ? 'https' : 'http'}://${node.host}:${node.port}`;
    const url = new URL('/v4/loadtracks', base);
    url.searchParams.set('identifier', identifier);

    const response = await fetch(url, {
      headers: {
        Authorization: node.password,
        'Client-Name': this.clientName,
      },
    });

    if (!response.ok) {
      throw new Error(`Lavalink loadtracks failed with status ${response.status}`);
    }

    const json = (await response.json()) as {
      loadType?: string;
      playlistInfo?: { name?: string; selectedTrack?: number };
      tracks?: LavalinkTrackLike[];
      data?: unknown;
    };

    const payload = json.data ?? json;
    const payloadIsArray = Array.isArray(payload);

    let payloadLoadType: string | undefined;
    if (!payloadIsArray && payload && typeof payload === 'object' && 'loadType' in payload) {
      const candidate = (payload as { loadType?: unknown }).loadType;
      if (typeof candidate === 'string') {
        payloadLoadType = candidate;
      }
    }
    const loadType = payloadLoadType ?? json.loadType ?? 'empty';

    let tracks: LavalinkTrackLike[] = [];
    if (payloadIsArray) {
      tracks = payload as LavalinkTrackLike[];
    } else if (payload && typeof payload === 'object' && Array.isArray((payload as { tracks?: unknown }).tracks)) {
      tracks = (payload as { tracks: LavalinkTrackLike[] }).tracks;
    } else if (Array.isArray(json.tracks)) {
      tracks = json.tracks;
    }

    let playlistInfo: { name?: string; selectedTrack?: number } | undefined;
    if (!payloadIsArray && payload && typeof payload === 'object' && 'playlistInfo' in payload) {
      const candidate = (payload as { playlistInfo?: unknown }).playlistInfo;
      if (candidate && typeof candidate === 'object') {
        playlistInfo = candidate as { name?: string; selectedTrack?: number };
      }
    }
    if (!playlistInfo && json.playlistInfo) {
      playlistInfo = json.playlistInfo;
    }

    this.logger.debug(
      {
        loadType,
        trackCount: tracks.length,
        payloadType: payloadIsArray ? 'array' : typeof payload,
      },
      'Parsed Lavalink loadtracks response',
    );

    return {
      loadType,
      tracks,
      playlistName: playlistInfo?.name,
      selectedTrackIndex: typeof playlistInfo?.selectedTrack === 'number' ? playlistInfo.selectedTrack : undefined,
    };
  }

  private forwardGatewayPayload(guildOrPacket: unknown, maybePacket?: unknown): void {
    if (typeof guildOrPacket === 'string' && maybePacket) {
      this.sendPayloadToGuild(guildOrPacket, maybePacket);
      return;
    }

    const payload = guildOrPacket ?? maybePacket;
    if (!payload || typeof payload !== 'object') {
      return;
    }

    const guildId =
      (payload as { guildId?: string }).guildId ??
      (payload as { d?: { guild_id?: string } }).d?.guild_id ??
      (payload as { guild_id?: string }).guild_id;

    if (typeof guildId !== 'string') {
      return;
    }

    this.sendPayloadToGuild(guildId, payload);
  }

  private sendPayloadToGuild(guildId: string, payload: unknown): void {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) {
      this.logger.debug({ guildId }, 'Unable to forward gateway payload: guild not cached');
      return;
    }

    const shard = guild.shard ?? this.client.ws.shards.get(guild.shardId) ?? this.client.ws.shards.first();
    if (!shard) {
      this.logger.debug({ guildId }, 'Unable to forward gateway payload: shard not found');
      return;
    }

    shard.send(payload as Record<string, unknown>);
  }

  private handleTrackStart(player: LavalinkPlayerLike, track: LavalinkTrackLike): void {
    const guildId = this.resolveGuildId(player);
    if (!guildId) {
      return;
    }
    const state = this.guildStates.get(guildId);
    if (!state) {
      return;
    }

    if (!state.current) {
      state.current = {
        track,
        requestedBy: state.queue.shift()?.requestedBy ?? {
          userId: this.client.user?.id ?? 'unknown',
          username: this.client.user?.tag ?? 'Anankor',
        },
        enqueuedAt: Date.now(),
      };
    }

    state.paused = false;
  }

  private async handleTrackEnd(
    player: LavalinkPlayerLike,
    track: LavalinkTrackLike,
    payload: unknown,
  ): Promise<void> {
    const guildId = this.resolveGuildId(player);
    if (!guildId) {
      return;
    }

    const state = this.guildStates.get(guildId);
    if (!state) {
      return;
    }

    state.current = null;
    state.paused = false;

    const reason = typeof payload === 'object' && payload
      ? (payload as { reason?: string }).reason ?? undefined
      : undefined;

    this.logger.debug(
      { guildId, reason, track: formatTrackTitle(track) },
      'Track ended, advancing queue',
    );

    const hasNext = await this.startNextTrack(guildId, state);
    if (!hasNext) {
      this.logger.debug({ guildId }, 'Queue drained after track end');
    }
  }

  private resolveGuildId(player: LavalinkPlayerLike, fallback?: string): string | null {
    if (player && typeof player.guildId === 'string') {
      return player.guildId;
    }
    if (typeof fallback === 'string') {
      return fallback;
    }
    return null;
  }
}

function isSupportedMusicJob(job: GuildCommandJobBase): job is SupportedMusicJob {
  return (
    job.type === 'music.play' ||
    job.type === 'music.pause' ||
    job.type === 'music.resume' ||
    job.type === 'music.skip' ||
    job.type === 'music.stop' ||
    job.type === 'music.queue' ||
    job.type === 'music.volume'
  );
}

function looksLikeUrl(query: string): boolean {
  return /^https?:\/\//i.test(query) || /^spotify:/i.test(query) || /^soundcloud:/i.test(query);
}

function formatTrackTitle(track: LavalinkTrackLike): string {
  const info = track.info ?? {};
  const title = typeof info.title === 'string' && info.title.length > 0 ? info.title : 'Untitled track';
  const author = typeof info.author === 'string' && info.author.length > 0 ? info.author : null;
  const length = typeof info.length === 'number' && Number.isFinite(info.length) ? info.length : null;

  let formatted = `**${escapeMarkdown(title)}**`;
  if (author) {
    formatted += ` by ${escapeMarkdown(author)}`;
  }
  if (length && length > 0) {
    formatted += ` (${formatDuration(length)})`;
  }

  return formatted;
}

function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return 'live';
  }

  const totalSeconds = Math.floor(durationMs / MS_IN_SECOND);
  const minutes = Math.floor(totalSeconds / SECONDS_IN_MINUTE);
  const seconds = totalSeconds % SECONDS_IN_MINUTE;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function isPlayerPlaying(player: LavalinkPlayerLike): boolean {
  if (typeof player.playing === 'boolean') {
    return player.playing;
  }
  if (typeof player.paused === 'boolean') {
    return !player.paused;
  }
  return true;
}
