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
    @Inject('DATA_SOURCE') private readonly dataSource: DataSource
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
    if (!this.dataSource.isInitialized) {
      console.warn(
        '[GameFlushService] DataSource not initialized. Re-initializing...'
      );
      await this.dataSource.initialize();
    }
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
    if (!this.dataSource.isInitialized) {
      console.warn(
        '[GameFlushService] DataSource not initialized. Re-initializing...'
      );
      await this.dataSource.initialize();
    }
    const dirtySetKey = `dirty_users:${canvasId}`;
    await this.redis.expire(dirtySetKey, 3600);
    const userIds = await this.redis.smembers(dirtySetKey);
    if (userIds.length === 0) {
      return;
    }

    for (const userId of userIds) {
      // 사용자 ID 유효성 검증
      if (!userId || userId === '0' || isNaN(Number(userId))) {
        console.warn(
          `[GameFlushService] 유효하지 않은 사용자 ID 감지: userId=${userId}, canvasId=${canvasId}`
        );
        continue;
      }

      // 사용자가 실제로 users 테이블에 존재하는지 확인
      try {
        const userExists = await this.dataSource.query(
          'SELECT id FROM users WHERE id = $1',
          [userId]
        );

        if (userExists.length === 0) {
          console.warn(
            `[GameFlushService] 존재하지 않는 사용자 ID 감지: userId=${userId}, canvasId=${canvasId}`
          );
          continue;
        }
      } catch (error) {
        console.error(
          `[GameFlushService] 사용자 존재 여부 확인 중 에러: userId=${userId}, canvasId=${canvasId}`,
          error
        );
        continue;
      }

      // own_count, try_count, dead, life 등 Redis에서 조회
      const [ownCount, tryCount, dead, life] = await Promise.all([
        this.redis.hget(`game:${canvasId}:user:${userId}`, 'own_count'),
        this.redis.hget(`game:${canvasId}:user:${userId}`, 'try_count'),
        this.redis.hget(`game:${canvasId}:user:${userId}`, 'dead'),
        this.redis.hget(`game:${canvasId}:user:${userId}`, 'life'),
      ]);

      // user_canvas 테이블에 UPSERT
      await this.dataSource.query(
        `INSERT INTO user_canvas (user_id, canvas_id, own_count, try_count, joined_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (user_id, canvas_id) 
         DO UPDATE SET own_count = $3, try_count = $4`,
        [userId, canvasId, ownCount || 0, tryCount || 0]
      );

      // game_user_result에도 life 반영 (있을 경우)
      await this.dataSource.query(
        'UPDATE game_user_result SET life=$1 WHERE canvas_id=$2 AND user_id=$3',
        [life || 2, canvasId, userId]
      );
    }
    await this.redis.del(dirtySetKey);
  }

  // 1초마다 또는 batch 10개마다 flush
  async flushLoop(canvasId: string) {
    setInterval(async () => {
      const pixelCount = await this.redis.scard(`dirty_pixels:${canvasId}`);
      const userCount = await this.redis.scard(`dirty_users:${canvasId}`);

      // 게임에서는 더 자주 flush (1개 이상이면 flush)
      if (pixelCount >= 10) {
        await this.flushDirtyPixels(canvasId);
      }
      if (userCount >= 10) {
        await this.flushDirtyUsers(canvasId);
      }

      // 30초마다 강제 flush (안전장치)
      const now = Date.now();
      const lastForceFlush = await this.redis.get(
        `last_force_flush:${canvasId}`
      );
      if (!lastForceFlush || now - parseInt(lastForceFlush) > 30000) {
        await this.flushDirtyPixels(canvasId);
        await this.flushDirtyUsers(canvasId);
        await this.redis.setex(
          `last_force_flush:${canvasId}`,
          60,
          now.toString()
        );
      }
    }, 1000);
  }
}
