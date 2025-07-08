import { Queue } from 'bullmq';
import { config } from 'dotenv';
import { redisConnection } from './bullmq.config';
config();

// Redis 연결 설정 생성 - 창현
const createQueueConnection = () => {
  if (typeof redisConnection === 'string') {
    // URL 기반 연결 (프로덕션)
    return {
      host: undefined, // URL 사용 시 host 제거
      port: undefined, // URL 사용 시 port 제거
      url: redisConnection,
      tls: redisConnection.startsWith('rediss://')
        ? {
            rejectUnauthorized: false,
          }
        : undefined,
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 100, 3000);
        console.log(
          `[BullMQ Queue] 재연결 시도 ${times}회, ${delay}ms 후 재시도`
        );
        return delay;
      },
      lazyConnect: true,
      connectTimeout: 15000,
      commandTimeout: 10000,
      enableReadyCheck: false,
      maxLoadingTimeout: 0,
    };
  } else {
    // 설정 객체 기반 연결 (로컬)
    return redisConnection;
  }
};

export const pixelQueue = new Queue('pixel-generation', {
  connection: createQueueConnection(),
});
