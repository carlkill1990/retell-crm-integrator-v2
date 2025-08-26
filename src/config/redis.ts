import { createClient } from 'redis';
import { logger } from './logger';

export const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

redis.on('error', (err) => {
  logger.error('Redis Client Error:', err);
});

redis.on('connect', () => {
  logger.info('✅ Redis connected successfully');
});

redis.on('disconnect', () => {
  logger.warn('Redis disconnected');
});

export async function connectRedis() {
  try {
    await redis.connect();
  } catch (error) {
    logger.error('❌ Redis connection failed:', error);
    process.exit(1);
  }
}

export async function disconnectRedis() {
  await redis.disconnect();
  logger.info('Redis disconnected');
}