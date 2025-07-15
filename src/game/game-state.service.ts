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
    console.log(`[GameStateService] 유저 목숨 설정: canvasId=${canvasId}, userId=${userId}, life=${value}`);
  }
  async getUserLife(canvasId: string, userId: string): Promise<number> {
    const life = parseInt(await this.redis.hget(`game:${canvasId}:user:${userId}`, 'life') || '0', 10);
    console.log(`[GameStateService] 유저 목숨 조회: canvasId=${canvasId}, userId=${userId}, life=${life}`);
    return life;
  }
  async decrUserLife(canvasId: string, userId: string): Promise<number> {
    const key = `game:${canvasId}:user:${userId}`;
    const life = await this.redis.hincrby(key, 'life', -1);
    await this.redis.expire(key, 3600);
    console.log(`[GameStateService] 유저 목숨 차감: canvasId=${canvasId}, userId=${userId}, life=${life}`);
    return life;
  }

  // 사망 여부
  async setUserDead(canvasId: string, userId: string, value: boolean) {
    await this.redis.hset(`game:${canvasId}:user:${userId}`, 'dead', value ? 1 : 0);
    await this.redis.expire(`game:${canvasId}:user:${userId}`, 3600);
    console.log(`[GameStateService] 유저 사망 상태 설정: canvasId=${canvasId}, userId=${userId}, dead=${value}`);
  }
  async getUserDead(canvasId: string, userId: string): Promise<boolean> {
    const dead = (await this.redis.hget(`game:${canvasId}:user:${userId}`, 'dead')) === '1';
    console.log(`[GameStateService] 유저 사망 상태 조회: canvasId=${canvasId}, userId=${userId}, dead=${dead}`);
    return dead;
  }

  // try_count
  async incrUserTryCount(canvasId: string, userId: string): Promise<number> {
    const key = `game:${canvasId}:user:${userId}`;
    const val = await this.redis.hincrby(key, 'try_count', 1);
    await this.redis.expire(key, 3600);
    console.log(`[GameStateService] 유저 시도 횟수 증가: canvasId=${canvasId}, userId=${userId}, try_count=${val}`);
    return val;
  }
  async getUserTryCount(canvasId: string, userId: string): Promise<number> {
    const tryCount = parseInt(await this.redis.hget(`game:${canvasId}:user:${userId}`, 'try_count') || '0', 10);
    console.log(`[GameStateService] 유저 시도 횟수 조회: canvasId=${canvasId}, userId=${userId}, try_count=${tryCount}`);
    return tryCount;
  }

  // own_count
  async incrUserOwnCount(canvasId: string, userId: string): Promise<number> {
    const key = `game:${canvasId}:user:${userId}`;
    const val = await this.redis.hincrby(key, 'own_count', 1);
    await this.redis.expire(key, 3600);
    console.log(`[GameStateService] 유저 소유 픽셀 증가: canvasId=${canvasId}, userId=${userId}, own_count=${val}`);
    return val;
  }
  async decrUserOwnCount(canvasId: string, userId: string): Promise<number> {
    const key = `game:${canvasId}:user:${userId}`;
    const val = await this.redis.hincrby(key, 'own_count', -1);
    await this.redis.expire(key, 3600);
    console.log(`[GameStateService] 유저 소유 픽셀 감소: canvasId=${canvasId}, userId=${userId}, own_count=${val}`);
    return val;
  }
  async getUserOwnCount(canvasId: string, userId: string): Promise<number> {
    const ownCount = parseInt(await this.redis.hget(`game:${canvasId}:user:${userId}`, 'own_count') || '0', 10);
    console.log(`[GameStateService] 유저 소유 픽셀 조회: canvasId=${canvasId}, userId=${userId}, own_count=${ownCount}`);
    return ownCount;
  }
  async setUserOwnCount(canvasId: string, userId: string, value: number) {
    await this.redis.hset(`game:${canvasId}:user:${userId}`, 'own_count', value);
    await this.redis.expire(`game:${canvasId}:user:${userId}`, 3600);
    console.log(`[GameStateService] 유저 소유 픽셀 강제 세팅: canvasId=${canvasId}, userId=${userId}, own_count=${value}`);
  }

  // 색상
  async setUserColor(canvasId: string, userId: string, color: string) {
    await this.redis.hset(`game:${canvasId}:user:${userId}`, 'color', color);
    await this.redis.expire(`game:${canvasId}:user:${userId}`, 3600);
    console.log(`[GameStateService] 유저 색상 설정: canvasId=${canvasId}, userId=${userId}, color=${color}`);
  }
  async getUserColor(canvasId: string, userId: string): Promise<string> {
    const color = await this.redis.hget(`game:${canvasId}:user:${userId}`, 'color') || '';
    console.log(`[GameStateService] 유저 색상 조회: canvasId=${canvasId}, userId=${userId}, color=${color}`);
    return color;
  }

  // 유저 목록
  async addUserToGame(canvasId: string, userId: string) {
    await this.redis.sadd(`game:${canvasId}:users`, userId);
    await this.redis.expire(`game:${canvasId}:users`, 3600);
    console.log(`[GameStateService] 유저 게임 참가: canvasId=${canvasId}, userId=${userId}`);
  }
  async getAllUsersInGame(canvasId: string): Promise<string[]> {
    const users = await this.redis.smembers(`game:${canvasId}:users`);
    console.log(`[GameStateService] 게임 참가 유저 목록 조회: canvasId=${canvasId}, users=${users.length}명`);
    return users;
  }

  // 사망자 목록
  async addDeadUser(canvasId: string, userId: string) {
    await this.redis.sadd(`game:${canvasId}:dead_users`, userId);
    await this.redis.expire(`game:${canvasId}:dead_users`, 3600);
    console.log(`[GameStateService] 사망자 추가: canvasId=${canvasId}, userId=${userId}`);
  }
  async getAllDeadUsers(canvasId: string): Promise<string[]> {
    const deadUsers = await this.redis.smembers(`game:${canvasId}:dead_users`);
    console.log(`[GameStateService] 사망자 목록 조회: canvasId=${canvasId}, deadUsers=${deadUsers.length}명`);
    return deadUsers;
  }
} 