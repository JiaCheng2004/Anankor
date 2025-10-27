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
  send?: (payload: unknown) => void;
  [key: string]: unknown;
}

export type LavalinkManager = unknown;

export async function createLavalinkManager(config: LavalinkManagerConfig): Promise<LavalinkManager> {
  const module = await import('lavalink-client');
  const Manager = (module as { Manager?: new (options: LavalinkManagerConfig) => LavalinkManager }).Manager;
  if (!Manager) {
    throw new Error('lavalink-client export "Manager" not found');
  }
  return new Manager(config);
}
