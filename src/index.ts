import 'dotenv/config';
import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { logger } from './shared/logger.js';
import { prisma } from './shared/database.js';
import { redis } from './shared/redis.js';
import { MusicService } from './services/music/MusicService.js';
import { GameService } from './services/games/GameService.js';
import { ApiService } from './services/api/ApiService.js';

class DiscordBot {
    public client: Client;
    public music: MusicService;
    public games: GameService;
    public api: ApiService;
    
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.MessageContent,
            ],
        });
        
        this.music = new MusicService(this);
        this.games = new GameService(this);
        this.api = new ApiService(this);
        
        this.setupEventHandlers();
    }
    
    private setupEventHandlers() {
        this.client.on('ready', this.onReady.bind(this));
        this.client.on('messageCreate', this.onMessageCreate.bind(this));
        this.client.on('interactionCreate', this.onInteractionCreate.bind(this));
        this.client.on('error', this.onError.bind(this));
    }
    
    private async onReady() {
        logger.info(`Bot logged in as ${this.client.user?.tag}`);
        
        // Initialize services
        await this.music.initialize();
        await this.games.initialize();
        await this.api.initialize();
        
        // Set bot presence
        this.client.user?.setActivity('with music and games');
    }
    
    private async onMessageCreate(message: any) {
        // Ignore bot messages
        if (message.author.bot) return;
        
        // Basic command handling
        if (message.content.startsWith('!')) {
            await this.handleCommand(message);
        }
    }
    
    private async onInteractionCreate(interaction: any) {
        if (!interaction.isChatInputCommand()) return;
        
        // Handle slash commands
        logger.info(`Received command: ${interaction.commandName}`);
    }
    
    private async onError(error: Error) {
        logger.error('Discord client error:', error);
    }
    
    private async handleCommand(message: any) {
        const [command, ...args] = message.content.slice(1).split(' ');
        
        switch (command.toLowerCase()) {
            case 'ping':
                await message.reply('Pong!');
                break;
            case 'play':
                await this.music.handlePlayCommand(message, args.join(' '));
                break;
            default:
                await message.reply('Unknown command');
        }
    }
    
    async start() {
        try {
            // Test database connection
            await prisma.$connect();
            logger.info('Database connected');
            
            // Test Redis connection
            await redis.ping();
            logger.info('Redis connected');
            
            // Login to Discord
            await this.client.login(process.env.DISCORD_TOKEN);
        } catch (error) {
            logger.error('Failed to start bot:', error);
            process.exit(1);
        }
    }
    
    async shutdown() {
        logger.info('Shutting down bot...');
        
        await this.music.shutdown();
        await this.games.shutdown();
        await this.api.shutdown();
        
        this.client.destroy();
        await prisma.$disconnect();
        await redis.disconnect();
        
        process.exit(0);
    }
}

// Create and start the bot
const bot = new DiscordBot();

// Handle graceful shutdown
process.on('SIGINT', () => bot.shutdown());
process.on('SIGTERM', () => bot.shutdown());

bot.start().catch((error) => {
    logger.error('Bot startup failed:', error);
    process.exit(1);
});
