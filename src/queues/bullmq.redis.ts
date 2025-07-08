// bullmq.redis.ts 혹은 bullmq.client.ts 등 새 파일 생성
import { Redis } from 'ioredis';
import { redisConnection } from './bullmq.config';

// Redis 클라이언트 생성
let redisClient: Redis;

if (typeof redisConnection === 'string') {
  // URL 기반 연결 (프로덕션) - 창현
  redisClient = new Redis(redisConnection, {
    tls: redisConnection.startsWith('rediss://')
      ? {
          rejectUnauthorized: false,
        }
      : undefined,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      const delay = Math.min(times * 100, 3000);
      console.log(
        `[BullMQ Client] 재연결 시도 ${times}회, ${delay}ms 후 재시도`
      );
      return delay;
    },
    lazyConnect: true,
    connectTimeout: 15000,
    commandTimeout: 10000,
    enableReadyCheck: false,
    maxLoadingTimeout: 0,
  });
} else {
  // 설정 객체 기반 연결 (로컬)
  redisClient = new Redis(redisConnection);
}

export { redisClient };
