import { RedisOptions } from 'ioredis';

export const redisConnection: RedisOptions = {
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  lazyConnect: false,
  connectTimeout: 10000,
  commandTimeout: 20000,
};
