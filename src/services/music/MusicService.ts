import { Shoukaku, Connectors } from 'shoukaku';
import { logger } from '../../shared/logger.js';
import { DiscordBot } from '../../index.js';

export class MusicService {
    private bot: DiscordBot;
    public shoukaku: Shoukaku | null = null;
    
    constructor(bot: DiscordBot) {
        this.bot = bot;
    }
    
    async initialize() {
        const nodes = JSON.parse(process.env.LAVALINK_NODES || '[]');
        
        this.shoukaku = new Shoukaku(new Connectors.DiscordJS(this.bot.client), nodes, {
            moveOnDisconnect: false,
            resume: false,
            reconnectTries: 3,
            reconnectInterval: 5,
        });
        
        this.shoukaku.on('ready', (name) => {
            logger.info(`Lavalink node ${name} connected`);
        });
        
        this.shoukaku.on('error', (name, error) => {
            logger.error(`Lavalink node ${name} error:`, error);
        });
        
        this.shoukaku.on('close', (name, code, reason) => {
            logger.warn(`Lavalink node ${name} closed: ${code} ${reason}`);
        });
        
        this.shoukaku.on('disconnect', (name, count) => {
            logger.warn(`Lavalink node ${name} disconnected ${count} times`);
        });
    }
    
    async handlePlayCommand(message: any, query: string) {
        if (!message.member.voice.channel) {
            await message.reply('You need to be in a voice channel to play music!');
            return;
        }
        
        if (!this.shoukaku) {
            await message.reply('Music service is not ready yet. Please try again later.');
            return;
        }
        
        try {
            // Get or create player
            const player = this.shoukaku.getPlayer(message.guild.id) || 
                await this.shoukaku.joinVoiceChannel({
                    guildId: message.guild.id,
                    channelId: message.member.voice.channel.id,
                    shardId: 0,
                    deaf: true,
                });
            
            // Search for the track
            const result = await player.node.rest.resolve(query);
            if (!result || !result.tracks.length) {
                await message.reply('No results found for your query.');
                return;
            }
            
            // Play the first track
            await player.playTrack({ track: result.tracks[0].encoded });
            
            await message.reply(`Now playing: ${result.tracks[0].info.title}`);
        } catch (error) {
            logger.error('Play command error:', error);
            await message.reply('An error occurred while trying to play music.');
        }
    }
    
    async shutdown() {
        if (this.shoukaku) {
            for (const player of this.shoukaku.players.values()) {
                player.connection.disconnect();
            }
        }
    }
}
