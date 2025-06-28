import { Injectable, Inject } from '@nestjs/common';
import { createCanvasDto } from './dto/create_canvas_dto.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Canvas } from './entity/canvas.entity';
import Redis from 'ioredis';
import { pixelQueue } from '../queues/bullmq.queue';
interface PixelData {
  x: number;
  y: number;
  color: string;
}

@Injectable()
export class CanvasService {
  constructor(
    @InjectRepository(Canvas)
    private readonly canvasRepository: Repository<Canvas>,
    @Inject('REDIS_CLIENT')
    private readonly redisClient: Redis,
  ) {}
  // 임시: 메모리 저장 (실서비스는 DB/Redis 등 사용)
  private pixels: Map<string, string> = new Map();

  // 픽셀 선점(동시성) 로직
  async tryDrawPixel({ canvas_id, x, y, color }: PixelData & { canvas_id: string }): Promise<boolean> {
    return true;
  }

  // 전체 픽셀 데이터 반환
  getAllPixels(): PixelData[] {
    return Array.from(this.pixels.entries()).map(([key, color]) => {
      const [x, y] = key.split(',').map(Number);
      return { x, y, color };
    });
  }

  async createCanvas(createCanvasDto: createCanvasDto): Promise<Canvas | null> {
    const { title, type, size_x, size_y, endedAt } = createCanvasDto;

    const canvas = this.canvasRepository.create({
      title: title,
      type: type,
      sizeX: size_x,
      sizeY: size_y,
      createdAt: new Date(),
      endedAt: endedAt,
    });

    try {
      const newCanvas = await this.canvasRepository.save(canvas);
      await pixelQueue.add('pixel-generation', {
        canvas_id: newCanvas.id,
        size_x,
        size_y,
        created_at: new Date(),
        updated_at: new Date(),
      });
      return newCanvas;
    } catch (err) {
      console.error(err);
      return null;
    }
  }
  async applyDrawPixel(pixel: PixelData & { canvas_id: string }): Promise<boolean> {
    return this.tryDrawPixel(pixel);
  }
}
