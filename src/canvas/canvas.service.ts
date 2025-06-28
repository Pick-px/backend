import { Injectable, Inject } from '@nestjs/common';
import { createCanvasDto } from './dto/create_canvas_dto.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Canvas } from './entity/canvas.entity';
import { Pixel } from '../pixel/entity/pixel.entity';
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
    @InjectRepository(Pixel)
    private readonly pixelRepository: Repository<Pixel>,
    @Inject('REDIS_CLIENT')
    private readonly redisClient: Redis,
  ) {}

  // 픽셀 저장 로직 (Redis만 사용)
  async tryDrawPixel({ canvas_id, x, y, color }: PixelData & { canvas_id: string }): Promise<boolean> {
    try {
      const key = `${canvas_id}:${x}:${y}`;
      
      // Redis에 저장 
      await this.redisClient.set(key, color);
      console.log(`Redis: 픽셀 저장 성공: ${key} = ${color}`);
      return true;
    } catch (error) {
      console.error('픽셀 저장 실패:', error);
      return false;
    }
  }

  // 픽셀 조회 로직 (Redis 우선, 없으면 PostgreSQL)
  async getAllPixels(canvas_id: string = 'default'): Promise<PixelData[]> {
    try {
      // Redis에서 먼저 조회
      const keys = await this.redisClient.keys(`${canvas_id}:*`);
      
      if (keys.length > 0) {
        const pixels: PixelData[] = [];
        for (const key of keys) {
          const color = await this.redisClient.get(key);
          if (color) {
            const [, x, y] = key.split(':');
            pixels.push({
              x: Number(x),
              y: Number(y),
              color
            });
          }
        }
        console.log(`Redis: 캔버스 ${canvas_id} 픽셀 ${pixels.length}개 조회`);
        return pixels;
      }
      
      // Redis에 없으면 PostgreSQL에서 조회
      console.log(`Redis에 데이터 없음, PostgreSQL에서 조회: ${canvas_id}`);
      const dbPixels = await this.pixelRepository.find({
        where: { canvasId: Number(canvas_id) },
        select: ['x', 'y', 'color']
      });
      
      // PostgreSQL 데이터를 Redis에 캐시
      for (const pixel of dbPixels) {
        const key = `${canvas_id}:${pixel.x}:${pixel.y}`;
        await this.redisClient.set(key, pixel.color);
      }
      
      const pixels: PixelData[] = dbPixels.map(pixel => ({
        x: pixel.x,
        y: pixel.y,
        color: pixel.color
      }));
      
      console.log(`PostgreSQL: 캔버스 ${canvas_id} 픽셀 ${pixels.length}개 조회 및 Redis 캐시`);
      return pixels;
    } catch (error) {
      console.error('픽셀 조회 실패:', error);
      return [];
    }
  }

  // 특정 픽셀 조회 (Redis만 사용)
  async getPixel(canvas_id: string, x: number, y: number): Promise<string | null> {
    try {
      const key = `${canvas_id}:${x}:${y}`;
      const color = await this.redisClient.get(key);
      
      if (color) {
        console.log(`Redis: 픽셀 조회 성공: ${key} = ${color}`);
        return color;
      }
      
      console.log(`픽셀 없음: ${key}`);
      return null;
    } catch (error) {
      console.error('픽셀 조회 실패:', error);
      return null;
    }
  }

  // 캔버스별 픽셀 개수 조회 (Redis만 사용)
  async getPixelCount(canvas_id: string): Promise<number> {
    try {
      const keys = await this.redisClient.keys(`${canvas_id}:*`);
      console.log(`Redis: 캔버스 ${canvas_id} 픽셀 ${keys.length}개`);
      return keys.length;
    } catch (error) {
      console.error('픽셀 개수 조회 실패:', error);
      return 0;
    }
  }

  // 캔버스 초기화 (Redis만 사용)
  async clearCanvas(canvas_id: string): Promise<void> {
    try {
      const keys = await this.redisClient.keys(`${canvas_id}:*`);
      if (keys.length > 0) {
        await this.redisClient.del(...keys);
        console.log(`Redis: 캔버스 ${canvas_id} 픽셀 ${keys.length}개 삭제`);
      }
    } catch (error) {
      console.error('캔버스 삭제 실패:', error);
    }
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
