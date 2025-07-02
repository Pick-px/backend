import { Worker } from 'bullmq';
import { config } from 'dotenv';
import { AppDataSource } from '../data-source';
import { redisConnection } from './bullmq.config';
import { Pixel } from '../pixel/entity/pixel.entity';
import { Canvas } from '../canvas/entity/canvas.entity';
import Redis from 'ioredis';

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

async function flushDirtyPixels() {
  try {
    const pixelRepo = AppDataSource.getRepository(Pixel);
    const canvasRepo = AppDataSource.getRepository(Canvas);

    const canvases = await canvasRepo.find();
    for (const canvas of canvases) {
      const dirtyKey = `dirty_pixels:${canvas.id}`;
      const dirtyPixels = await redis.smembers(dirtyKey);
      if (dirtyPixels.length === 0) continue;

      console.log(
        `[Worker] Flushing ${dirtyPixels.length} dirty pixels for canvas ${canvas.id}`
      );

      for (const xy of dirtyPixels) {
        const [x, y] = xy.split(':');
        const color = await redis.get(`${canvas.id}:${x}:${y}`);
        if (!color) continue;

        let pixel = await pixelRepo.findOne({
          where: { canvasId: canvas.id, x: Number(x), y: Number(y) },
        });
        if (pixel) {
          pixel.color = color;
          await pixelRepo.save(pixel);
        } else {
          await pixelRepo.save({
            canvasId: canvas.id,
            x: Number(x),
            y: Number(y),
            color,
          });
        }
      }
      // flush 후 dirty set 비우기
      await redis.del(dirtyKey);
    }
    console.log('[Worker] Redis→DB dirty 픽셀 flush 완료');
  } catch (error) {
    console.error('[Worker] Redis→DB flush 에러:', error);
  }
}

// 30초초마다 실행
const flushInterval = setInterval(() => {
  flushDirtyPixels().catch(console.error);
}, 30000);

// 프로세스 종료 시 정리
process.on('SIGTERM', async () => {
  console.log('[Worker] SIGTERM 수신, 정리 작업 시작...');
  clearInterval(flushInterval);
  if (worker) {
    await worker.close();
  }
  if (redis) {
    await redis.quit();
  }
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Worker] SIGINT 수신, 정리 작업 시작...');
  clearInterval(flushInterval);
  if (worker) {
    await worker.close();
  }
  if (redis) {
    await redis.quit();
  }
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
  process.exit(0);
});

void (async () => {
  try {
    console.log('[Worker] 워커 프로세스 시작...');

    // Redis 연결 - 개선된 설정 사용
    redis = new Redis({
      ...redisConnection,
      commandTimeout: 30000, // 30초로 늘림
      connectTimeout: 30000, // 30초로 늘림
      maxRetriesPerRequest: 3,
    });

    // Redis 연결 테스트
    await redis.ping();
    console.log('[Worker] Redis 연결 성공');

    // DataSource 초기화
    await AppDataSource.initialize();
    console.log('[Worker] DataSource 초기화 완료');

    // 워커 생성
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
              pixel.color = '#FFFFFF';
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
          throw error; // BullMQ가 job을 재시도하도록 함
        }
      },
      {
        concurrency: 8,
        connection: {
          ...redisConnection,
          commandTimeout: 30000,
          connectTimeout: 30000,
        },
        removeOnComplete: { count: 100 }, // 완료된 job 100개만 유지
        removeOnFail: { count: 50 }, // 실패한 job 50개만 유지
      }
    );

    // 워커 이벤트 리스너
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

export { worker };
