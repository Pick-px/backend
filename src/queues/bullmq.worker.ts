import { Worker } from 'bullmq';
import { config } from 'dotenv';
import { AppDataSource } from '../data-source';
import { redisConnection } from './bullmq.config';
import { Pixel } from '../pixel/entity/pixel.entity';

config();

type PixelGenerationJobData = {
  canvas_id: number;
  size_x: number;
  size_y: number;
  created_at: Date;
  updated_at: Date;
};

let worker: Worker<PixelGenerationJobData>;

void (async () => {
  try {
    await AppDataSource.initialize();
    console.log('DataSource initialized in worker.');
    worker = new Worker<PixelGenerationJobData>(
      'pixel-generation',
      async (job) => {
        const start = Date.now();
        const { canvas_id, size_x, size_y, created_at, updated_at } = job.data;

        const pixels: Pixel[] = [];

        for (let x = 0; x < size_x; x++) {
          for (let y = 0; y < size_y; y++) {
            const pixel = new Pixel();
            pixel.canvasId = canvas_id;
            pixel.x = x;
            pixel.y = y;
            pixel.createdAt = created_at;
            pixel.updatedAt = updated_at;
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
      },
      {
        // 지금 로직 상으로는 병렬 처리가 의미가 없음
        // 나중에 성능 저하가 일어난다고 판단될 시 로직 수정 후 병렬 처리
        // concurrency: 8,
        connection: redisConnection,
      },
    );

    console.log('Worker started and ready for jobs.');
  } catch (error) {
    console.error('Failed to initialize DataSource in worker:', error);
  }
})();

export { worker };
