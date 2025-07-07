import { RedisOptions } from 'ioredis';
import { Redis } from 'ioredis';

export const redisConnection: RedisOptions = {
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  lazyConnect: true,
  connectTimeout: 10000,
  commandTimeout: 5000,
};

let redis: Redis;

// Redis 연결 - bullmq.config.ts의 설정 사용
redis = new Redis(redisConnection);
