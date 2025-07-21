// 캔버스의 픽셀 정보(특정 유저가 소유한 픽셀 전체 등)를 Redis/DB에서 조회.
// 유저가 사망할 때 해당 유저의 모든 픽셀을 "자유화(주인 없음, 검정색)" 처리.

import { Injectable, Inject, forwardRef } from '@nestjs/common';
import Redis from 'ioredis';
import { CanvasService } from '../canvas/canvas.service';

@Injectable()
export class GamePixelService {
  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    @Inject(forwardRef(() => CanvasService))
    private readonly canvasService: CanvasService
  ) {}

  async getCanvasSize(
    canvasId: string
  ): Promise<{ sizeX: number; sizeY: number }> {
    const sizeX = parseInt(
      (await this.redis.get(`canvas:${canvasId}:sizeX`)) || '100',
      10
    );
    const sizeY = parseInt(
      (await this.redis.get(`canvas:${canvasId}:sizeY`)) || '100',
      10
    );
    return { sizeX, sizeY };
  }

  async freeAllPixelsOfUser(
    canvasId: string,
    userId: string | number
  ): Promise<{ x: number; y: number; color: string }[]> {
    // 픽셀 정보 조회 (Redis 우선, 없으면 DB에서 가져와 캐싱)
    let pixels: {
      x: number;
      y: number;
      color: string;
      owner: number | null;
    }[] = [];
    try {
      pixels = await this.canvasService.getAllPixels(canvasId);
    } catch (e) {
      pixels = [];
    }

    const freedPixels: { x: number; y: number; color: string }[] = [];
    const pipeline = this.redis.pipeline();

    for (const pixel of pixels) {
      if (String(pixel.owner) === String(userId)) {
        // Redis에서 픽셀 정보 업데이트 (검은색, owner null)
        const hashKey = `canvas:${canvasId}`;
        const field = `${pixel.x}:${pixel.y}`;
        const pixelData = `#000000|`; // owner 없음

        pipeline.hset(hashKey, field, pixelData);

        freedPixels.push({ x: pixel.x, y: pixel.y, color: '#000000' });
      }
    }

    // Redis 파이프라인 실행
    if (freedPixels.length > 0) {
      await pipeline.exec();
    }

    return freedPixels;
  }
}
