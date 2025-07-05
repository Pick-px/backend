import { Worker } from 'bullmq';
import { config } from 'dotenv';
import { AppDataSource } from '../data-source';
import { redisConnection } from './bullmq.config';
import { Pixel } from '../pixel/entity/pixel.entity';
import { Canvas } from '../canvas/entity/canvas.entity';
import Redis from 'ioredis';
import { Chat } from '../group/entity/chat.entity';
import { Group } from '../group/entity/group.entity';

config();

type PixelGenerationJobData = {
  canvas_id: number;
  size_x: number;
  size_y: number;
  created_at: Date;
  updated_at: Date;
};

let worker: Worker<PixelGenerationJobData>;
let redis: Redis;

// 배치 처리를 위한 큐
const pixelBatchQueue: Map<number, Set<string>> = new Map();
const chatBatchQueue: Map<number, any[]> = new Map();

// 배치 크기 설정
const PIXEL_BATCH_SIZE = 100;
const CHAT_BATCH_SIZE = 50;
const BATCH_TIMEOUT_MS = 10000; // 10초 후 강제 flush

// 픽셀 변경사항을 배치에 추가
async function addPixelToBatch(canvasId: number, x: number, y: number, color: string) {
  if (!pixelBatchQueue.has(canvasId)) {
    pixelBatchQueue.set(canvasId, new Set());
  }
  
  const batch = pixelBatchQueue.get(canvasId)!;
  batch.add(`${x}:${y}:${color}`);
  
  // 배치 크기 도달 시 즉시 flush
  if (batch.size >= PIXEL_BATCH_SIZE) {
    await flushPixelBatch(canvasId);
  }
}

// 채팅 메시지를 배치에 추가
async function addChatToBatch(groupId: number, chatData: any) {
  if (!chatBatchQueue.has(groupId)) {
    chatBatchQueue.set(groupId, []);
  }
  
  const batch = chatBatchQueue.get(groupId)!;
  batch.push(chatData);
  
  // 배치 크기 도달 시 즉시 flush
  if (batch.length >= CHAT_BATCH_SIZE) {
    await flushChatBatch(groupId);
  }
}

// 픽셀 배치 flush
async function flushPixelBatch(canvasId: number) {
  const batch = pixelBatchQueue.get(canvasId);
  if (!batch || batch.size === 0) return;
  
  try {
    const pixelRepo = AppDataSource.getRepository(Pixel);
    const pixelsToUpdate: Pixel[] = [];
    const pixelsToInsert: Pixel[] = [];
    
    for (const pixelData of batch) {
      const [x, y, color] = pixelData.split(':');
      const existingPixel = await pixelRepo.findOne({
        where: { canvasId, x: Number(x), y: Number(y) }
      });
      
      if (existingPixel) {
        existingPixel.color = color;
        pixelsToUpdate.push(existingPixel);
      } else {
        pixelsToInsert.push({
          canvasId,
          x: Number(x),
          y: Number(y),
          color,
          createdAt: new Date(),
          updatedAt: new Date()
        } as Pixel);
      }
    }
    
    // 배치 업데이트/삽입
    if (pixelsToUpdate.length > 0) {
      await pixelRepo.save(pixelsToUpdate);
    }
    if (pixelsToInsert.length > 0) {
      await pixelRepo.save(pixelsToInsert);
    }
    
    console.log(`[Worker] 픽셀 배치 flush 완료: canvas=${canvasId}, 개수=${batch.size}`);
    batch.clear();
  } catch (error) {
    console.error(`[Worker] 픽셀 배치 flush 에러:`, error);
  }
}

// 채팅 배치 flush
async function flushChatBatch(groupId: number) {
  const batch = chatBatchQueue.get(groupId);
  if (!batch || batch.length === 0) return;
  
  try {
    const chatRepo = AppDataSource.getRepository(Chat);
    const chatsToInsert = batch.map(chat => ({
      groupId,
      userId: chat.user.id,
      message: chat.message,
      createdAt: chat.created_at,
      updatedAt: chat.created_at
    }));
    
    await chatRepo.save(chatsToInsert);
    console.log(`[Worker] 채팅 배치 flush 완료: group=${groupId}, 개수=${batch.length}`);
    batch.length = 0; // 배열 비우기
  } catch (error) {
    console.error(`[Worker] 채팅 배치 flush 에러:`, error);
  }
}

// 주기적 강제 flush (안전장치)
const forceFlushInterval = setInterval(async () => {
  for (const [canvasId] of pixelBatchQueue) {
    await flushPixelBatch(canvasId);
  }
  for (const [groupId] of chatBatchQueue) {
    await flushChatBatch(groupId);
  }
}, BATCH_TIMEOUT_MS);

// Redis 이벤트 리스너 설정
async function setupRedisEventListeners() {
  // 픽셀 변경 이벤트 구독
  const pixelSubscriber = new Redis(redisConnection);
  await pixelSubscriber.subscribe('pixel:updated');
  
  pixelSubscriber.on('message', async (channel, message) => {
    try {
      const { canvasId, x, y, color } = JSON.parse(message);
      await addPixelToBatch(canvasId, x, y, color);
    } catch (error) {
      console.error('[Worker] 픽셀 이벤트 처리 에러:', error);
    }
  });
  
  // 채팅 메시지 이벤트 구독
  const chatSubscriber = new Redis(redisConnection);
  await chatSubscriber.subscribe('chat:message');
  
  chatSubscriber.on('message', async (channel, message) => {
    try {
      const { groupId, chatData } = JSON.parse(message);
      await addChatToBatch(groupId, chatData);
    } catch (error) {
      console.error('[Worker] 채팅 이벤트 처리 에러:', error);
    }
  });
}

// 워커 및 리소스 종료 처리
async function gracefulShutdown() {
  console.log('[Worker] 종료 신호 수신, 정리 작업 시작...');
  clearInterval(forceFlushInterval);
  
  // 남은 배치들 강제 flush
  for (const [canvasId] of pixelBatchQueue) {
    await flushPixelBatch(canvasId);
  }
  for (const [groupId] of chatBatchQueue) {
    await flushChatBatch(groupId);
  }
  
  if (worker) await worker.close();
  if (redis) await redis.quit();
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(0);
}
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// 메인 워커 실행
void (async () => {
  try {
    console.log('[Worker] 워커 프로세스 시작...');
    redis = new Redis(redisConnection);
    await redis.ping();
    console.log('[Worker] Redis 연결 성공');
    await AppDataSource.initialize();
    console.log('[Worker] DataSource 초기화 완료');
    
    // Redis 이벤트 리스너 설정
    await setupRedisEventListeners();
    console.log('[Worker] Redis 이벤트 리스너 설정 완료');
    
    worker = new Worker<PixelGenerationJobData>(
      'pixel-generation',
      async (job) => {
        try {
          const start = Date.now();
          const { canvas_id, size_x, size_y, created_at, updated_at } =
            job.data;
          console.log(
            `[Worker] Job 시작: canvas_id=${canvas_id}, size=${size_x}x${size_y}`
          );
          const pixels: Pixel[] = [];
          for (let y = 0; y < size_y; y++) {
            for (let x = 0; x < size_x; x++) {
              const pixel = new Pixel();
              pixel.canvasId = canvas_id;
              pixel.x = x;
              pixel.y = y;
              pixel.createdAt = created_at;
              pixel.updatedAt = updated_at;
              pixel.color = '#000000';
              pixels.push(pixel);
            }
          }
          const pixelRepo = AppDataSource.getRepository(Pixel);
          const chunkSize = 5000;
          for (let i = 0; i < pixels.length; i += chunkSize) {
            const chunk = pixels.slice(i, i + chunkSize);
            await pixelRepo
              .createQueryBuilder()
              .insert()
              .into(Pixel)
              .values(chunk)
              .execute();
          }
          const duration = Date.now() - start;
          console.log(
            `[Worker] Pixel 작업 완료 (${pixels.length}개) - ${duration}ms`
          );
        } catch (error) {
          console.error(`[Worker] Job 처리 중 에러:`, error);
          throw error;
        }
      },
      {
        concurrency: 8,
        connection: {
          ...redisConnection,
          commandTimeout: 30000,
          connectTimeout: 30000,
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      }
    );
    worker.on('completed', (job) => {
      console.log(`[Worker] Job 완료: ${job.id}`);
    });
    worker.on('failed', (job, err) => {
      console.error(`[Worker] Job 실패: ${job?.id}`, err);
    });
    worker.on('error', (err) => {
      console.error('[Worker] 워커 에러:', err);
    });
    console.log('[Worker] 워커 시작 완료, job 대기 중...');
  } catch (error) {
    console.error('[Worker] 초기화 실패:', error);
    process.exit(1);
  }
})();

// 이벤트 발행 헬퍼 함수들
export async function publishPixelUpdate(canvasId: number, x: number, y: number, color: string) {
  try {
    await redis.publish('pixel:updated', JSON.stringify({ canvasId, x, y, color }));
  } catch (error) {
    console.error('[Worker] 픽셀 이벤트 발행 에러:', error);
  }
}

export async function publishChatMessage(groupId: number, chatData: any) {
  try {
    await redis.publish('chat:message', JSON.stringify({ groupId, chatData }));
  } catch (error) {
    console.error('[Worker] 채팅 이벤트 발행 에러:', error);
  }
}

export { worker };
