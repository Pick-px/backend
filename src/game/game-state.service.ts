// 게임 내 유저의 상태(목숨, 소유 픽셀 수, 시도 횟수, 색상, 사망 여부, 참가자/사망자 목록 등)를
// Redis에 저장/조회/증가/감소하는 유틸리티.

import { Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class GameStateService {
  constructor(
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
  ) {}

  // 목숨
  async setUserLife(canvasId: string, userId: string, value: number) {
    await this.redis.hset(`game:${canvasId}:user:${userId}`, 'life', value);
    await this.redis.expire(`game:${canvasId}:user:${userId}`, 3600);
  }
  async getUserLife(canvasId: string, userId: string): Promise<number> {
    return parseInt(await this.redis.hget(`game:${canvasId}:user:${userId}`, 'life') || '0', 10);
  }
  async decrUserLife(canvasId: string, userId: string): Promise<number> {
    const key = `game:${canvasId}:user:${userId}`;
    const life = await this.redis.hincrby(key, 'life', -1);
    await this.redis.expire(key, 3600);
    return life;
  }

  // 사망 여부
  async setUserDead(canvasId: string, userId: string, value: boolean) {
    await this.redis.hset(`game:${canvasId}:user:${userId}`, 'dead', value ? 1 : 0);
    await this.redis.expire(`game:${canvasId}:user:${userId}`, 3600);
  }
  async getUserDead(canvasId: string, userId: string): Promise<boolean> {
    return (await this.redis.hget(`game:${canvasId}:user:${userId}`, 'dead')) === '1';
  }

  // try_count
  async incrUserTryCount(canvasId: string, userId: string): Promise<number> {
    const key = `game:${canvasId}:user:${userId}`;
    const val = await this.redis.hincrby(key, 'try_count', 1);
    await this.redis.expire(key, 3600);
    return val;
  }
  async getUserTryCount(canvasId: string, userId: string): Promise<number> {
    return parseInt(await this.redis.hget(`game:${canvasId}:user:${userId}`, 'try_count') || '0', 10);
  }

  // own_count
  async incrUserOwnCount(canvasId: string, userId: string): Promise<number> {
    const key = `game:${canvasId}:user:${userId}`;
    const val = await this.redis.hincrby(key, 'own_count', 1);
    await this.redis.expire(key, 3600);
    return val;
  }
  async decrUserOwnCount(canvasId: string, userId: string): Promise<number> {
    const key = `game:${canvasId}:user:${userId}`;
    const val = await this.redis.hincrby(key, 'own_count', -1);
    await this.redis.expire(key, 3600);
    return val;
  }
  async getUserOwnCount(canvasId: string, userId: string): Promise<number> {
    return parseInt(await this.redis.hget(`game:${canvasId}:user:${userId}`, 'own_count') || '0', 10);
  }

  // 색상
  async setUserColor(canvasId: string, userId: string, color: string) {
    await this.redis.hset(`game:${canvasId}:user:${userId}`, 'color', color);
    await this.redis.expire(`game:${canvasId}:user:${userId}`, 3600);
  }
  async getUserColor(canvasId: string, userId: string): Promise<string> {
    return await this.redis.hget(`game:${canvasId}:user:${userId}`, 'color') || '';
  }

  // 유저 목록
  async addUserToGame(canvasId: string, userId: string) {
    await this.redis.sadd(`game:${canvasId}:users`, userId);
    await this.redis.expire(`game:${canvasId}:users`, 3600);
  }
  async getAllUsersInGame(canvasId: string): Promise<string[]> {
    return await this.redis.smembers(`game:${canvasId}:users`);
  }

  // 사망자 목록
  async addDeadUser(canvasId: string, userId: string) {
    await this.redis.sadd(`game:${canvasId}:dead_users`, userId);
    await this.redis.expire(`game:${canvasId}:dead_users`, 3600);
  }
  async getAllDeadUsers(canvasId: string): Promise<string[]> {
    return await this.redis.smembers(`game:${canvasId}:dead_users`);
  }
} 