import Redis from 'ioredis';
import { redisConnection } from './bullmq.config';

// 공유 Redis 클라이언트 생성
export const redisClient = new Redis(redisConnection);

// 프로세스 종료 시 연결 정리
process.on('exit', () => {
  redisClient.disconnect();
});
