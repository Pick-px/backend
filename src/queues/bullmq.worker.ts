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

// 배치 처리를 위한 큐 (전체 통합 - 대용량 처리용)
const pixelBatchQueue: Set<string> = new Set();
const chatBatchQueue: any[] = [];

// 배치 처리 설정 (대용량 최적화)
const PIXEL_BATCH_SIZE = 200; // 픽셀 배치 크기
const CHAT_BATCH_SIZE = 100; // 채팅 배치 크기
const BATCH_TIMEOUT_MS = 5000; // 10초

// 픽셀 변경사항을 배치에 추가 (전체 통합 + 중복 제거)
async function addPixelToBatch(
  canvasId: number,
  x: number,
  y: number,
  color: string
) {
  // 기존 같은 픽셀 제거 (최신 색상만 유지)
  const pixelKey = `${canvasId}:${x}:${y}`;
  for (const existingPixel of pixelBatchQueue) {
    if (existingPixel.startsWith(pixelKey + ':')) {
      pixelBatchQueue.delete(existingPixel);
      break;
    }
  }

  const pixelData = `${pixelKey}:${color}`;
  pixelBatchQueue.add(pixelData);

  // 배치 크기 도달 시 즉시 flush
  if (pixelBatchQueue.size >= PIXEL_BATCH_SIZE) {
    console.log(
      `[Worker] 픽셀 배치 크기 도달으로 즉시 flush: 개수=${pixelBatchQueue.size}`
    );
    await flushPixelBatch();
  }
}

// 채팅 메시지를 배치에 추가 (전체 통합)
async function addChatToBatch(groupId: number, chatData: any) {
  chatBatchQueue.push({ groupId, chatData });

  // 배치 크기 도달 시 즉시 flush
  if (chatBatchQueue.length >= CHAT_BATCH_SIZE) {
    console.log(
      `[Worker] 채팅 배치 크기 도달으로 즉시 flush: 개수=${chatBatchQueue.length}`
    );
    await flushChatBatch();
  }
}

// 픽셀 배치 flush (전체 통합)
async function flushPixelBatch(isForceFlush: boolean = false) {
  if (pixelBatchQueue.size === 0) return;

  try {
    const pixelRepo = AppDataSource.getRepository(Pixel);
    const pixelsToUpdate: Pixel[] = [];

    // 캔버스별로 그룹화
    const canvasGroups = new Map<
      number,
      Array<{ x: number; y: number; color: string }>
    >();

    for (const pixelData of pixelBatchQueue) {
      const [canvasId, x, y, color] = pixelData.split(':');
      if (!canvasGroups.has(Number(canvasId))) {
        canvasGroups.set(Number(canvasId), []);
      }
      canvasGroups.get(Number(canvasId))!.push({
        x: Number(x),
        y: Number(y),
        color,
      });
    }

    // 각 캔버스별로 업데이트
    for (const [canvasId, pixels] of canvasGroups) {
      const xys = pixels.map(({ x, y }) => ({ x, y }));
      const existingPixels = await pixelRepo.find({
        where: xys.map(({ x, y }) => ({ canvasId, x, y })),
      });

      const pixelMap = new Map<string, Pixel>();
      for (const pixel of existingPixels) {
        pixelMap.set(`${pixel.x},${pixel.y}`, pixel);
      }

      for (const { x, y, color } of pixels) {
        const key = `${x},${y}`;
        const existingPixel = pixelMap.get(key);
        if (existingPixel) {
          existingPixel.color = color;
          pixelsToUpdate.push(existingPixel);
        }
      }
    }

    if (pixelsToUpdate.length > 0) {
      const queryRunner = AppDataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {
        // Bulk update using CASE WHEN
        const cases: string[] = [];
        const whereIn: string[] = [];
        const parameters: any = {};

        pixelsToUpdate.forEach((pixel, i) => {
          const id = `p${i}`;
          cases.push(
            `WHEN canvas_id = :canvasId_${id} AND x = :x_${id} AND y = :y_${id} THEN :color_${id}`
          );
          whereIn.push(`(:canvasId_${id}, :x_${id}, :y_${id})`);
          parameters[`canvasId_${id}`] = pixel.canvasId;
          parameters[`x_${id}`] = pixel.x;
          parameters[`y_${id}`] = pixel.y;
          parameters[`color_${id}`] = pixel.color;
        });

        const caseSQL = cases.join('\n');
        const whereSQL = whereIn.join(', ');

        await queryRunner.query(
          `
          UPDATE pixel
          SET color = CASE
            ${caseSQL}
          END
          WHERE (canvas_id, x, y) IN (${whereSQL})
          `,
          parameters
        );
        await queryRunner.commitTransaction();
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        await queryRunner.release();
      }
    }

    const flushType = isForceFlush ? '강제 flush' : '즉시 flush';
    console.log(
      `[Worker] 픽셀 ${flushType} 완료: 총개수=${pixelBatchQueue.size}, 업데이트=${pixelsToUpdate.length}`
    );
    pixelBatchQueue.clear();
  } catch (error) {
    console.error(`[Worker] 픽셀 배치 flush 에러:`, error);
  }
}

// 채팅 배치 flush (전체 통합)
async function flushChatBatch(isForceFlush: boolean = false) {
  if (chatBatchQueue.length === 0) return;

  try {
    const chatRepo = AppDataSource.getRepository(Chat);
    const chatsToInsert = chatBatchQueue.map(({ groupId, chatData }) => ({
      groupId,
      userId: chatData.user.id,
      message: chatData.message,
      createdAt: chatData.created_at,
      updatedAt: chatData.created_at,
    }));

    await chatRepo.save(chatsToInsert);
    const flushType = isForceFlush ? '강제 flush' : '즉시 flush';
    console.log(
      `[Worker] 채팅 ${flushType} 완료: 개수=${chatBatchQueue.length}`
    );
    chatBatchQueue.length = 0; // 배열 비우기
  } catch (error) {
    console.error(`[Worker] 채팅 배치 flush 에러:`, error);
  }
}

// 주기적 강제 flush (안전장치)
const forceFlushInterval = setInterval(async () => {
  let totalPixelFlushCount = 0;
  let totalChatFlushCount = 0;

  if (pixelBatchQueue.size > 0) {
    totalPixelFlushCount = pixelBatchQueue.size;
    await flushPixelBatch(true);
  }

  if (chatBatchQueue.length > 0) {
    totalChatFlushCount = chatBatchQueue.length;
    await flushChatBatch(true);
  }

  if (totalPixelFlushCount > 0 || totalChatFlushCount > 0) {
    console.log(
      `[Worker] 강제 flush 완료: 픽셀=${totalPixelFlushCount}개, 채팅=${totalChatFlushCount}개`
    );
  }
}, BATCH_TIMEOUT_MS);

// Redis 이벤트 리스너 설정
async function setupRedisEventListeners() {
  // 픽셀 변경 이벤트 구독 (기본 Redis 사용)
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

  // 채팅 메시지 이벤트 구독 (기본 Redis 사용)
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

  // === 3개 Redis 분리 이벤트 리스너 ===
  /*
  // 픽셀 변경 이벤트 구독 (픽셀 전용 Redis 사용)
  const pixelRedisConfig = {
    host: process.env.REDIS_PIXEL_HOST || 'redis-pixel',
    port: parseInt(process.env.REDIS_PIXEL_PORT || '6379', 10),
    password: process.env.REDIS_PIXEL_PASSWORD || undefined,
    lazyConnect: true,
  };
  const pixelSubscriber = new Redis(pixelRedisConfig);
  await pixelSubscriber.subscribe('pixel:updated');
  
  pixelSubscriber.on('message', async (channel, message) => {
    try {
      const { canvasId, x, y, color } = JSON.parse(message);
      await addPixelToBatch(canvasId, x, y, color);
    } catch (error) {
      console.error('[Worker] 픽셀 이벤트 처리 에러:', error);
    }
  });
  
  // 채팅 메시지 이벤트 구독 (채팅 전용 Redis 사용)
  const chatRedisConfig = {
    host: process.env.REDIS_CHAT_HOST || 'redis-chat',
    port: parseInt(process.env.REDIS_CHAT_PORT || '6379', 10),
    password: process.env.REDIS_CHAT_PASSWORD || undefined,
    lazyConnect: true,
  };
  const chatSubscriber = new Redis(chatRedisConfig);
  await chatSubscriber.subscribe('chat:message');
  
  chatSubscriber.on('message', async (channel, message) => {
    try {
      const { groupId, chatData } = JSON.parse(message);
      await addChatToBatch(groupId, chatData);
    } catch (error) {
      console.error('[Worker] 채팅 이벤트 처리 에러:', error);
    }
  });
  */
}

// 워커 및 리소스 종료 처리
async function gracefulShutdown() {
  console.log('[Worker] 종료 신호 수신, 정리 작업 시작...');
  clearInterval(forceFlushInterval);

  // 남은 배치들 강제 flush
  await flushPixelBatch();
  await flushChatBatch();

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
export async function publishPixelUpdate(
  canvasId: number,
  x: number,
  y: number,
  color: string
) {
  try {
    await redis.publish(
      'pixel:updated',
      JSON.stringify({ canvasId, x, y, color })
    );
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
