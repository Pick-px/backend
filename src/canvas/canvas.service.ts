import { Injectable, Inject } from '@nestjs/common';
import { createCanvasDto } from './dto/create_canvas_dto.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Canvas } from './entity/canvas.entity';
import { Pixel } from '../pixel/entity/pixel.entity';
import Redis from 'ioredis';
import { pixelQueue } from '../queues/bullmq.queue';

@Injectable()
export class CanvasService {
  constructor(
    @InjectRepository(Canvas)
    private readonly canvasRepository: Repository<Canvas>,
    @InjectRepository(Pixel)
    private readonly pixelRepository: Repository<Pixel>,
    @Inject('REDIS_CLIENT')
    private readonly redisClient: Redis
  ) {}

  // 픽셀 저장 로직 (Redis만 사용)
  async tryDrawPixel({
    canvas_id,
    x,
    y,
    color,
  }: {
    canvas_id: string;
    x: number;
    y: number;
    color: string;
  }): Promise<boolean> {
    try {
      const key = `${canvas_id}:${x}:${y}`;

      // Redis에 저장
      await this.redisClient.set(key, color);

      // dirty_pixels set에 추가 (워커가 DB로 flush하기 위해)
      await this.redisClient.sadd(`dirty_pixels:${canvas_id}`, `${x}:${y}`);

      console.log(`Redis: 픽셀 저장 성공: ${key} = ${color}`);
      return true;
    } catch (error) {
      console.error('픽셀 저장 실패:', error);
      return false;
    }
  }

  // Redis에서 픽셀 조회
  async getPixelsFromRedis(
    canvas_id: string
  ): Promise<{ x: number; y: number; color: string }[]> {
    const keys = await this.redisClient.keys(`${canvas_id}:*`);
    if (keys.length === 0) return [];
    const pixels: { x: number; y: number; color: string }[] = [];
    for (const key of keys) {
      const color = await this.redisClient.get(key);
      if (color) {
        const [, x, y] = key.split(':');
        pixels.push({
          x: Number(x),
          y: Number(y),
          color,
        });
      }
    }
    return pixels;
  }

  // DB에서 픽셀 조회
  async getPixelsFromDB(
    canvas_id: string
  ): Promise<{ x: number; y: number; color: string }[]> {
    const dbPixels = await this.pixelRepository.find({
      where: { canvasId: Number(canvas_id) },
      select: ['x', 'y', 'color'],
    });
    return dbPixels.map((pixel) => ({
      x: pixel.x,
      y: pixel.y,
      color: pixel.color,
    }));
  }

  // 통합: Redis 우선, 없으면 DB + Redis 캐싱
  async getAllPixels(
    canvas_id?: string
  ): Promise<{ x: number; y: number; color: string }[]> {
    let realCanvasId = canvas_id;
    if (!realCanvasId) {
      const defaultCanvas = await this.canvasRepository.findOne({
        order: { id: 'ASC' },
      });
      realCanvasId = defaultCanvas?.id?.toString();
    }
    if (!realCanvasId) return [];

    // 1. Redis에서 조회
    const redisPixels = await this.getPixelsFromRedis(realCanvasId);
    if (redisPixels.length > 0) return redisPixels;

    // 2. DB에서 조회
    const dbPixels = await this.getPixelsFromDB(realCanvasId);
    // 3. Redis에 캐싱
    for (const pixel of dbPixels) {
      const key = `${realCanvasId}:${pixel.x}:${pixel.y}`;
      await this.redisClient.set(key, pixel.color);
    }
    return dbPixels;
  }

  // 특정 픽셀 조회 (Redis만 사용)
  async getPixel(
    canvas_id: string,
    x: number,
    y: number
  ): Promise<string | null> {
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

  async applyDrawPixel({
    canvas_id,
    x,
    y,
    color,
  }: {
    canvas_id: string;
    x: number;
    y: number;
    color: string;
  }): Promise<boolean> {
    return this.tryDrawPixel({ canvas_id, x, y, color });
  }

  async getCanvasById(canvas_id?: string) {
    let realCanvasId = canvas_id;
    if (!realCanvasId) {
      const canvases = await this.canvasRepository.find({
        order: { id: 'ASC' },
        take: 1,
      });
      const defaultCanvas = canvases[0];
      realCanvasId = defaultCanvas?.id?.toString();
    }
    if (!realCanvasId) return null;
    const idNum = Number(realCanvasId);
    if (isNaN(idNum)) return null;
    const canvas = await this.canvasRepository.findOneBy({ id: idNum });
    return {
      canvas_id: realCanvasId,
      metaData: canvas,
    };
  }
}
