import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { PixelData } from './interfaces/pixel-data.interface';

@Injectable()
export class CanvasService {
  private redis: Redis;
  private isRedisConnected = false;

  constructor() {
    this.redis = new Redis({
      host: 'localhost',
      port: 6379,
      // 필요한 경우 password, db 등 추가
    });

    this.redis.on('connect', () => {
      console.log('Redis 연결 성공');
      this.isRedisConnected = true;
    });

    this.redis.on('error', (error) => {
      console.error('Redis 연결 실패:', error);
      this.isRedisConnected = false;
    });

    this.redis.on('close', () => {
      console.log('Redis 연결 종료');
      this.isRedisConnected = false;
    });
  }

  async tryDrawPixel({ canvas_id, x, y, color }: PixelData & { canvas_id: string }): Promise<boolean> {
    try {
      if (!this.isRedisConnected) {
        console.warn('Redis 연결되지 않음, 픽셀 그리기 무시');
        return false;
      }
      
      const key = `${canvas_id}:${x}:${y}`;
      const exists = await this.redis.exists(key);
      if (exists) return false;
      await this.redis.set(key, color);
      return true;
    } catch (error) {
      console.error('Redis 픽셀 저장 실패:', error);
      return false;
    }
  }

  async getAllPixels(canvas_id: string): Promise<PixelData[]> {
    try {
      if (!this.isRedisConnected) {
        console.warn('Redis 연결되지 않음, 빈 배열 반환');
        return [];
      }
      
      const keys = await this.redis.keys(`${canvas_id}:*`);
      const pixels = (
        await Promise.all(
          keys.map(async (key) => {
            try {
              const color = await this.redis.get(key);
              if (!color) return null;
              const [, x, y] = key.split(':');
              return { x: Number(x), y: Number(y), color };
            } catch (error) {
              console.error(`픽셀 데이터 조회 실패 (key: ${key}):`, error);
              return null;
            }
          })
        )
      ).filter((p): p is PixelData => p !== null);    
      return pixels;
    } catch (error) {
      console.error('Redis 픽셀 조회 실패:', error);
      return [];
    }
  }

  async applyDrawPixel(pixel: PixelData & { canvas_id: string }): Promise<boolean> {
    return this.tryDrawPixel(pixel);
  }
}
