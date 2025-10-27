import { Collection, type Interaction } from 'discord.js';

export type InteractionExecutor = (interaction: Interaction) => Promise<void> | void;

export interface InteractionRouter {
  register: (name: string, handler: InteractionExecutor) => void;
  execute: (name: string, interaction: Interaction) => Promise<void>;
  has: (name: string) => boolean;
}

export function createInteractionRouter(): InteractionRouter {
  const handlers = new Collection<string, InteractionExecutor>();

  return {
    register: (name, handler) => {
      handlers.set(name, handler);
    },
    has: (name) => handlers.has(name),
    async execute(name, interaction) {
      const handler = handlers.get(name);
      if (!handler) {
        throw new Error(`No handler registered for interaction "${name}"`);
      }
      await handler(interaction);
    },
  };
}
