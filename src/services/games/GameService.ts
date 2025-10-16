import { logger } from '../../shared/logger.js';
import { DiscordBot } from '../../index.js';

export class GameService {
    private bot: DiscordBot;
    
    constructor(bot: DiscordBot) {
        this.bot = bot;
    }
    
    async initialize() {
        logger.info('Game service initialized');
    }
    
    async shutdown() {
        logger.info('Game service shutdown');
    }
}
