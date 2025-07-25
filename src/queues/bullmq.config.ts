import { RedisOptions } from 'ioredis';

export const redisConnection: RedisOptions = {
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  lazyConnect: false,
  connectTimeout: 10000,
  commandTimeout: 20000, // NestJS와 동일하게 맞춤
  keepAlive: 30000,
  retryStrategy: (times) => {
    const delay = Math.min(500 + times * 200, 5000);
    console.log(`[Redis] 재연결 시도 ${times}회, ${delay}ms 후 재시도`);
    return delay;
  },
  family: 4,
  enableReadyCheck: true,
  enableAutoPipelining: true,
};
