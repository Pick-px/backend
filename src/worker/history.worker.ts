import { Worker } from 'bullmq';
import { Canvas } from '../canvas/entity/canvas.entity';
import { Pixel } from '../pixel/entity/pixel.entity';
import { AppDataSource } from '../data-source';
import { generatorPixelToImg } from '../util/imageGenerator.util';
import { AwsService } from '../aws/aws.service';
import { randomUUID } from 'crypto';
import { redisConnection } from '../queues/bullmq.config';

const canvasRepository = AppDataSource.getRepository(Canvas);
const pixelRepository = AppDataSource.getRepository(Pixel);
const awsService = new AwsService();

const historyWorker = new Worker(
  'canvas-history',
  async (job) => {
    const canvas_id = job.id;
    const canvas = await canvasRepository.findOne({
      where: { id: Number(canvas_id) },
    });
    if (!canvas) throw new Error('Canvas not found');
    const pixelData: { x: number; y: number; color: string }[] =
      await pixelRepository.query(
        'select x, y, color from pixels where cavans_id = $1::intger',
        [Number(canvas_id)]
      );

    const buffer = await generatorPixelToImg(
      pixelData,
      canvas.sizeX,
      canvas.sizeY
    );
    const contentType = 'image/png';
    const key = `history/${canvas_id}/${randomUUID()}.png`;
    await awsService.uploadFile(buffer, key, contentType);
  },
  { concurrency: 4, connection: redisConnection }
);

export { historyWorker };
