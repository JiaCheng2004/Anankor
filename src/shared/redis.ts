import Redis from 'ioredis';
import { logger } from './logger.js';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redis.on('error', (error) => {
    logger.error('Redis connection error:', error);
});

redis.on('connect', () => {
    logger.info('Redis connected successfully');
});

export { redis };
