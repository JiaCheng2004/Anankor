import type { ChatInputCommand, CommandContext } from './types.js';
import { pingCommand } from './ping.js';
import { createPlayCommand } from './play.js';
import { createSkipCommand } from './skip.js';
import { createPauseCommand } from './pause.js';
import { createResumeCommand } from './resume.js';
import { createStopCommand } from './stop.js';
import { createQueueCommand } from './queue.js';
import { createVolumeCommand } from './volume.js';
import { createFavoritesCommand } from './favorites.js';
import { createPlaylistCommand } from './playlist.js';
import { createRadioCommand } from './radio.js';
import { createTurtleCommand } from './turtle.js';
import { createWerewolfCommand } from './werewolf.js';
import { createUndercoverCommand } from './undercover.js';

export function createChatInputCommands(): ChatInputCommand[] {
  return [
    pingCommand,
    createPlayCommand(),
    createSkipCommand(),
    createPauseCommand(),
    createResumeCommand(),
    createStopCommand(),
    createQueueCommand(),
    createVolumeCommand(),
    createFavoritesCommand(),
    createPlaylistCommand(),
    createRadioCommand(),
    createTurtleCommand(),
    createWerewolfCommand(),
    createUndercoverCommand(),
  ];
}

export type { ChatInputCommand, CommandContext } from './types.js';
