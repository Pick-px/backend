import { RedisOptions } from 'ioredis';
import { Redis } from 'ioredis';

// Redis 연결 설정 생성 함수 - 창현
const createRedisConfig = (): RedisOptions | string => {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    // 프로덕션: REDIS_URL 사용
    console.log('[BullMQ] REDIS_URL을 사용하여 연결 설정');
    return redisUrl;
  } else {
    // 로컬 개발: 기존 설정 사용
    console.log('[BullMQ] 개별 환경변수 사용');
    return {
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      connectTimeout: 10000,
      commandTimeout: 5000,
    };
  }
};

export const redisConnection = createRedisConfig();

// Redis 클라이언트 생성
let redis: Redis;

if (typeof redisConnection === 'string') {
  // URL 기반 연결 (프로덕션) - 창현
  redis = new Redis(redisConnection, {
    tls: redisConnection.startsWith('rediss://')
      ? {
          rejectUnauthorized: false,
        }
      : undefined,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      const delay = Math.min(times * 100, 3000);
      console.log(
        `[BullMQ Redis] 재연결 시도 ${times}회, ${delay}ms 후 재시도`
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
  redis = new Redis(redisConnection);
}
