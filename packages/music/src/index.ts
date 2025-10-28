export interface LavalinkNodeConfig {
  id: string;
  host: string;
  port: number;
  password: string;
  secure?: boolean;
}

export interface LavalinkManagerConfig {
  nodes: LavalinkNodeConfig[];
  shards?: number;
  userId?: string;
  send?: (...args: unknown[]) => void;
  sendToShard?: (guildId: string, payload: unknown) => void;
  client?: {
    id?: string;
    username?: string;
  };
  [key: string]: unknown;
}

export type LavalinkManager = unknown;

export async function createLavalinkManager(config: LavalinkManagerConfig): Promise<LavalinkManager> {
  const module = (await import('lavalink-client')) as Record<string, unknown>;
  const candidates = [module.LavalinkManager, module.Manager, module.default];

  for (const candidate of candidates) {
    if (typeof candidate === 'function') {
      const ManagerCtor = candidate as new (options: Record<string, unknown>) => LavalinkManager;
      return new ManagerCtor(normaliseManagerConfig(config));
    }
  }

  throw new Error('lavalink-client manager export not found');
}

function normaliseManagerConfig(config: LavalinkManagerConfig): Record<string, unknown> {
  if (typeof config.sendToShard !== 'function') {
    throw new Error('Lavalink manager requires a sendToShard(guildId, payload) callback');
  }

  const { client: clientInfo, ...rest } = config;

  const nodes = config.nodes.map((node): Record<string, unknown> => ({
    id: node.id,
    host: node.host,
    port: node.port,
    authorization: node.password,
    secure: node.secure ?? false,
  }));

  let client: Record<string, unknown> | undefined;
  if (clientInfo && typeof clientInfo.id === 'string' && clientInfo.id.length > 0) {
    client = {
      id: clientInfo.id,
      username: clientInfo.username ?? 'unknown',
    };
  }

  return {
    ...rest,
    nodes,
    ...(client ? { client } : {}),
  };
}
