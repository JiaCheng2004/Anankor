import fastify from 'fastify';
import { logger } from '../../shared/logger.js';
import { DiscordBot } from '../../index.js';

export class ApiService {
    private bot: DiscordBot;
    private server: any;
    
    constructor(bot: DiscordBot) {
        this.bot = bot;
        this.server = fastify({ logger: true });
    }
    
    async initialize() {
        this.setupRoutes();
        
        try {
            await this.server.listen({ port: 3000, host: '0.0.0.0' });
            logger.info('API server listening on port 3000');
        } catch (error) {
            logger.error('API server failed to start:', error);
        }
    }
    
    private setupRoutes() {
        this.server.get('/health', async () => {
            return { status: 'ok', timestamp: new Date().toISOString() };
        });
        
        // Add more routes for webhooks, dashboard, etc.
    }
    
    async shutdown() {
        await this.server.close();
        logger.info('API service shutdown');
    }
}
