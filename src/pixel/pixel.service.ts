import { Injectable } from '@nestjs/common';
import { pixelQueue } from '../queues/bullmq.queue';
import { Canvas } from '../canvas/entity/canvas.entity';
@Injectable()
export class PixelService {
  constructor() {}

  async generatePixel(canvas: Canvas) {
    await pixelQueue.add('pixel-generation', {
      canvas_id: canvas.id,
      size_x: canvas.sizeX,
      size_y: canvas.sizeY,
      created_at: canvas.createdAt,
      updated_at: canvas.createdAt,
    });
  }
}
