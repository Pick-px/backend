import { Worker, Job } from 'bullmq';
import { Pixel } from '../pixel/entity/pixel.entity';
import { AppDataSource } from '../data-source';
import { generatorPixelToImg } from '../util/imageGenerator.util';
import { uploadBufferToS3 } from '../util/s3UploadFile.util';
import { randomUUID } from 'crypto';
import { redisConnection } from '../queues/bullmq.config';
import { ImageHistory } from '../canvas/entity/imageHistory.entity';
import { CanvasHistory } from '../canvas/entity/canvasHistory.entity';

const pixelRepository = AppDataSource.getRepository(Pixel);
const historyRepository = AppDataSource.getRepository(CanvasHistory);
const imgRepository = AppDataSource.getRepository(ImageHistory);

const historyWorker = new Worker(
  'canvas-history',
  async (job: Job) => {
    console.time('history start');
    const { canvas_id, size_x, size_y } = job.data;

    const pixelData: { x: number; y: number; color: string }[] =
      await pixelRepository.query(
        'select x, y, color from pixels where canvas_id = $1::INTEGER',
        [canvas_id]
      );
    const buffer = await generatorPixelToImg(pixelData, size_x, size_y);
    const contentType = 'image/png';
    const key = `history/${canvas_id}/${randomUUID()}.png`;
    await uploadBufferToS3(buffer, key, contentType);
    console.timeEnd('history start');

    const history = await historyRepository.findOne({
      where: { canvas_id: canvas_id },
    });

    if (!history) throw new Error('CanvasHistory not found');

    await imgRepository.save({
      canvasHistory: history,
      image_url: key,
      captured_at: new Date(),
    });
  },
  {
    concurrency: 4,
    connection: {
      ...redisConnection,
      commandTimeout: 30000,
      connectTimeout: 30000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  }
);

historyWorker.on('completed', (job) => {
  console.log(`[HistoryWorker] Job 완료: ${job.id}`);
});
historyWorker.on('failed', (job, err) => {
  console.error(`[HistoryWorker] Job 실패: ${job?.id}`, err);
});
historyWorker.on('error', (err) => {
  console.error('[HistoryWorker] 워커 에러:', err);
});

export { historyWorker };
