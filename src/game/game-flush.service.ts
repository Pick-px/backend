// Redis에 임시로 저장된 "dirty" 데이터(변경된 픽셀, 유저 상태)를
// 주기적으로 DB에 일괄 반영(Flush) 하는 역할.
// 1초마다 또는 10개 이상 변경 시 batch로 DB update.

import { Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';

@Injectable()
export class GameFlushService {
  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    @Inject('DATA_SOURCE') private readonly dataSource: DataSource,
  ) {}

  // 픽셀 dirty set에 추가
  async addDirtyPixel(canvasId: string, x: number, y: number) {
    await this.redis.sadd(`dirty_pixels:${canvasId}`, `${x}:${y}`);
  }

  // 유저 dirty set에 추가
  async addDirtyUser(canvasId: string, userId: string) {
    await this.redis.sadd(`dirty_users:${canvasId}`, userId);
    await this.redis.expire(`dirty_users:${canvasId}`, 3600);
  }

  // 픽셀 batch flush
  async flushDirtyPixels(canvasId: string) {
    const dirtySetKey = `dirty_pixels:${canvasId}`;
    const fields = await this.redis.smembers(dirtySetKey);
    if (fields.length === 0) return;
    const hashKey = `canvas:${canvasId}`;
    const pipeline = this.redis.pipeline();
    for (const field of fields) {
      pipeline.hget(hashKey, field);
    }
    const results = await pipeline.exec();
    // DB 일괄 update
    if (!results) return;
    for (let i = 0; i < fields.length; i++) {
      const [x, y] = fields[i].split(':').map(Number);
      const redisResult = results[i];
      if (!redisResult || typeof redisResult[1] !== 'string') continue;
      const value = redisResult[1];
      if (value) {
        const [color, owner] = value.split('|');
        await this.dataSource.query(
          'UPDATE pixels SET color=$1, owner=$2 WHERE canvas_id=$3 AND x=$4 AND y=$5',
          [color, owner || null, canvasId, x, y]
        );
      }
    }
    await this.redis.del(dirtySetKey);
  }

  // 유저 batch flush
  async flushDirtyUsers(canvasId: string) {
    const dirtySetKey = `dirty_users:${canvasId}`;
    await this.redis.expire(dirtySetKey, 3600);
    const userIds = await this.redis.smembers(dirtySetKey);
    if (userIds.length === 0) return;
    for (const userId of userIds) {
      // own_count, try_count, dead, life 등 Redis에서 조회
      const [ownCount, tryCount, dead, life] = await Promise.all([
        this.redis.hget(`game:${canvasId}:user:${userId}`, 'own_count'),
        this.redis.hget(`game:${canvasId}:user:${userId}`, 'try_count'),
        this.redis.hget(`game:${canvasId}:user:${userId}`, 'dead'),
        this.redis.hget(`game:${canvasId}:user:${userId}`, 'life'),
      ]);
      // DB update (UserCanvas 등)
      await this.dataSource.query(
        'UPDATE user_canvas SET own_count=$1, try_count=$2, dead=$3, life=$4 WHERE canvas_id=$5 AND user_id=$6',
        [ownCount, tryCount, dead === '1', life, canvasId, userId]
      );
      // game_user_result에도 life 반영 (있을 경우)
      await this.dataSource.query(
        'UPDATE game_user_result SET life=$1 WHERE canvas_id=$2 AND user_id=$3',
        [life, canvasId, userId]
      );
    }
    await this.redis.del(dirtySetKey);
  }

  // 1초마다 또는 batch 10개마다 flush
  async flushLoop(canvasId: string) {
    setInterval(async () => {
      const pixelCount = await this.redis.scard(`dirty_pixels:${canvasId}`);
      const userCount = await this.redis.scard(`dirty_users:${canvasId}`);
      if (pixelCount >= 10) await this.flushDirtyPixels(canvasId);
      if (userCount >= 10) await this.flushDirtyUsers(canvasId);
    }, 1000);
  }
} 