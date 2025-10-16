import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
});

export { prisma };
