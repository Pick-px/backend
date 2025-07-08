// bullmq.redis.ts 혹은 bullmq.client.ts 등 새 파일 생성
import { Redis } from 'ioredis';
import { redisConnection } from './bullmq.config';

export const redisClient = new Redis(redisConnection);
