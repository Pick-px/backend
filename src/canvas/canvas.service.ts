import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { createCanvasDto } from './dto/create_canvas_dto.dto';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Canvas } from './entity/canvas.entity';
import { Pixel } from '../pixel/entity/pixel.entity';
import Redis from 'ioredis';
import { pixelQueue } from '../queues/bullmq.queue';
import { Group } from '../group/entity/group.entity';
import { GroupUser } from '../entity/GroupUser.entity';
import { User } from '../user/entity/user.entity';
import { UserCanvas } from '../entity/UserCanvas.entity';
import { CanvasInfo } from '../interface/CanvasInfo.interface';
import { DrawPixelResponse } from '../interface/DrawPixelResponse.interface';

@Injectable()
export class CanvasService {
  constructor(
    @InjectRepository(Canvas)
    private readonly canvasRepository: Repository<Canvas>,
    @InjectRepository(Pixel)
    private readonly pixelRepository: Repository<Pixel>,
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(UserCanvas)
    private readonly userCanvasRepository: Repository<UserCanvas>,
    @Inject('REDIS_CLIENT')
    private readonly redisClient: Redis,
    @InjectDataSource()
    private readonly dataSource: DataSource
  ) {}

  // 픽셀 저장 로직 (Redis Hash 사용 + Pipeline 최적화)
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
      const hashKey = `canvas:${canvas_id}`;
      const field = `${x}:${y}`;

      // Pipeline으로 3개 명령을 한 번에 처리
      const pipeline = this.redisClient.pipeline();
      pipeline.hset(hashKey, field, color);
      pipeline.expire(hashKey, 3 * 24 * 60 * 60);
      pipeline.sadd(`dirty_pixels:${canvas_id}`, field);

      await pipeline.exec();

      console.log(`Redis: 픽셀 저장 성공: ${hashKey} ${field} = ${color}`);
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
    console.time('fromRedis');
    const hash = await this.redisClient.hgetall(`canvas:${canvas_id}`);
    console.timeEnd('fromRedis');
    const pixels: { x: number; y: number; color: string }[] = [];
    console.time('push');
    for (const key in hash) {
      const [x, y] = key.split(':').map(Number);
      const color = hash[key];
      pixels.push({ x, y, color });
    }
    console.timeEnd('push');
    return pixels;
  }

  // DB에서 픽셀 조회
  async getPixelsFromDB(
    canvas_id: string
  ): Promise<{ x: number; y: number; color: string }[]> {
    console.time('fromdb');
    try {
      const dbPixels: { x: number; y: number; color: string }[] =
        await this.dataSource.query(
          'SELECT x, y, color FROM pixels WHERE canvas_id = $1::INTEGER',
          [canvas_id]
        );
      return dbPixels;
    } finally {
      console.timeEnd('fromdb');
    }
    // console.time('map');
    // const result = dbPixels.map((pixel) => ({
    //   x: pixel.x,
    //   y: pixel.y,
    //   color: pixel.color,
    // }));
    // console.timeEnd('map');
  }

  // 통합: Redis 우선, 없으면 DB + Redis 캐싱
  async getAllPixels(
    canvas_id?: string
  ): Promise<{ x: number; y: number; color: string }[]> {
    let realCanvasId = canvas_id;

    if (!realCanvasId) {
      const defaultCanvas = await this.canvasRepository.find({
        order: { id: 'ASC' },
        take: 1,
      });
      const canvas = defaultCanvas[0];
      realCanvasId = canvas?.id?.toString();
    }
    if (!realCanvasId) return [];

    // 1. Redis에서 조회
    const redisPixels = await this.getPixelsFromRedis(realCanvasId);
    if (redisPixels.length > 0) return redisPixels;

    // 2. DB에서 조회
    const dbPixels = await this.getPixelsFromDB(realCanvasId);
    // 3. Redis에 캐싱
    const pipeline = this.redisClient.pipeline();
    for (const pixel of dbPixels) {
      // const key = `${realCanvasId}:${pixel.x}:${pixel.y}`;
      // await this.redisClient.set(key, pixel.color);
      const field = `${pixel.x}:${pixel.y}`;
      pipeline.hset(`canvas:${realCanvasId}`, field, pixel.color);
    }
    await pipeline.exec();
    return dbPixels;
  }

  // 특정 픽셀 조회 (Redis만 사용) - Todo : 소유자 확인
  async getPixel(
    canvas_id: string,
    x: number,
    y: number
  ): Promise<string | null> {
    try {
      // const key = `${canvas_id}:${x}:${y}`;
      const key = `canvas:${canvas_id}`;
      const field = `${x}:${y}`;
      const color = await this.redisClient.hget(key, field);

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

  async getCanvasList(status: string) {
    try {
      if (status === 'active') {
        // 종료되지 않은 모든 캔버스 (시작 전 + 종료 전)
        const result: CanvasInfo[] = await this.dataSource.query(
          `select id as "canvasId", title, type, created_at, started_at, ended_at, size_x, size_y 
           from canvases 
           where (ended_at IS NULL OR ended_at > NOW())`,
          []
        );
        return result;
      } else {
        // 종료된 캔버스만
        const result: CanvasInfo[] = await this.dataSource.query(
          `select id as "canvasId", title, type, created_at, started_at, ended_at, size_x, size_y 
           from canvases 
           where ended_at IS NOT NULL AND ended_at <= NOW()`,
          []
        );
        return result;
      }
    } catch (err) {
      throw new NotFoundException('DB에서 조회 실패!');
    }
  }

  // 캔버스 생성 함수 refactor 필수
  async createCanvas(createCanvasDto: createCanvasDto): Promise<Canvas | null> {
    const { title, type, size_x, size_y, startedAt, endedAt } = createCanvasDto;

    // 캔버스 엔티티 생성
    const canvas = this.canvasRepository.create({
      title: title,
      type: type,
      sizeX: size_x,
      sizeY: size_y,
      createdAt: new Date(),
      startedAt: startedAt,
      endedAt: endedAt,
    });

    try {
      // 캔버스 저장
      const newCanvas = await this.canvasRepository.save(canvas);
      // 픽셀 생성 작업 큐에 추가
      await pixelQueue.add('pixel-generation', {
        canvas_id: newCanvas.id,
        size_x,
        size_y,
        created_at: new Date(),
        updated_at: new Date(),
      });
      // 캔버스별 전체 채팅 그룹 자동 생성
      const savedGroup = await this.groupRepository.save({
        name: '전체',
        createdAt: new Date(),
        updatedAt: new Date(),
        maxParticipants: 100, // 전체 채팅 최대 인원(추후 변경 가능)
        currentParticipantsCount: 1,
        canvasId: newCanvas.id,
        madeBy: 1, // 1번 관리자 계정으로 고정
        is_default: true,
      });
      // 그룹 저장
      // 관리자(1번) 유저를 group_users에 추가
      const groupUser = new GroupUser();
      groupUser.group = savedGroup;
      groupUser.user = { id: 1 } as User;
      groupUser.joinedAt = new Date();
      groupUser.canvas_id = newCanvas.id;
      await this.groupRepository.manager.save(GroupUser, groupUser);
      // 캔버스 생성 완료 반환
      return newCanvas;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  // 픽셀 그리기 적용 함수 (동시성 제어 포함)
  async applyDrawPixel({
    canvas_id,
    x,
    y,
    color,
    userId,
  }: {
    canvas_id: string;
    x: number;
    y: number;
    color: string;
    userId: number;
  }): Promise<boolean> {
    // 픽셀 단위 분산락 (동시성 제어)
    const lockKey = `lock:${canvas_id}:${x}:${y}`;
    const lockUser = userId.toString();
    const ttl = 20; // 락 유지 시간(ms)

    // Redis NX 락 시도
    const is_locked = await this.redisClient.set(
      lockKey,
      lockUser,
      'PX',
      ttl,
      'NX'
    );

    if (!is_locked) {
      // 이미 다른 사용자가 락을 선점한 경우
      console.warn(`동시성 발생! canvas-id : ${canvas_id}, ${x}:${y}`);
      return false;
    }

    try {
      // 실제 픽셀 저장
      return await this.tryDrawPixel({ canvas_id, x, y, color });
    } finally {
      // 락 해제
      await this.releaseRedisLock(lockKey, lockUser);
    }
  }

  // Redis 락 해제 (분산락 안전 해제)
  private async releaseRedisLock(
    lockKey: string,
    lockUser: string
  ): Promise<void> {
    // Lua 스크립트로 락 소유자만 해제
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await this.redisClient.eval(script, 1, lockKey, lockUser);
  }

  // 캔버스 ID로 캔버스 정보 조회
  async getCanvasById(canvas_id?: string) {
    let realCanvasId = canvas_id;
    if (!realCanvasId) {
      // 기본 캔버스 조회
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
    // 메타데이터 조회
    const meta = await this.canvasRepository.findOneBy({ id: idNum });
    return {
      canvas_id: realCanvasId,
      metaData: meta,
    };
  }

  // 쿨다운 적용 픽셀 그리기
  async applyDrawPixelWithCooldown({
    canvas_id,
    x,
    y,
    color,
    userId,
  }: {
    canvas_id: string;
    x: number;
    y: number;
    color: string;
    userId: number;
  }): Promise<DrawPixelResponse> {
    const cooldownKey = `cooldown:${userId}:${canvas_id}`;
    const cooldownSeconds = 10;

    // 남은 쿨다운 확인 (Redis TTL 사용)
    const ttl = await this.redisClient.ttl(cooldownKey);

    if (ttl > 0) {
      return { success: false, message: '쿨다운 중', remaining: ttl };
    }

    // 동시성 제어 포함 픽셀 그리기 적용
    const result = await this.applyDrawPixel({
      canvas_id,
      x,
      y,
      color,
      userId,
    });

    // draw-pixel 이벤트가 처리되었으므로 user_canvas의 count를 1 증가
    try {
      await this.incrementUserCanvasCount(userId, parseInt(canvas_id));
    } catch (error) {
      console.error('사용자 캔버스 카운트 증가 실패:', error);
      // 카운트 증가 실패는 로그만 남기고 픽셀 그리기는 계속 진행
    }

    if (result) {
      await this.redisClient.setex(cooldownKey, cooldownSeconds, '1');
      return { success: true, cooldown: cooldownSeconds };
    } else {
      return { success: false, message: '픽셀 저장 실패' };
    }
  }

  // 쿨다운 적용 픽셀 그리기 for simulation
  async applyDrawPixelForSimulation({
    canvas_id,
    x,
    y,
    color,
    userId,
  }: {
    canvas_id: string;
    x: number;
    y: number;
    color: string;
    userId: number;
  }): Promise<DrawPixelResponse> {
    // const cooldownKey = `cooldown:${userId}:${canvas_id}`;
    // const cooldownSeconds = 5;

    // // 남은 쿨다운 확인 (Redis TTL 사용)
    // const ttl = await this.redisClient.ttl(cooldownKey);

    // if (ttl > 0) {
    //   return { success: false, message: '쿨다운 중', remaining: ttl };
    // }

    // 동시성 제어 포함 픽셀 그리기 적용
    const result = await this.applyDrawPixel({
      canvas_id,
      x,
      y,
      color,
      userId,
    });

    // // draw-pixel 이벤트가 처리되었으므로 user_canvas의 count를 1 증가
    // try {
    //   await this.incrementUserCanvasCount(userId, parseInt(canvas_id));
    // } catch (error) {
    //   console.error('사용자 캔버스 카운트 증가 실패:', error);
    //   // 카운트 증가 실패는 로그만 남기고 픽셀 그리기는 계속 진행
    // }

    if (result) {
      // await this.redisClient.setex(cooldownKey, cooldownSeconds, '1');
      return { success: true, message: '픽셀 저장 성공' };
    } else {
      return { success: false, message: '픽셀 저장 실패' };
    }
  }

  // user_canvas 테이블의 count를 1씩 증가시키는 메서드
  private async incrementUserCanvasCount(
    userId: number,
    canvasId: number
  ): Promise<void> {
    try {
      // user_canvas 레코드가 있는지 확인
      let userCanvas = await this.userCanvasRepository.findOne({
        where: {
          user: { id: userId },
          canvas: { id: canvasId },
        },
      });

      if (userCanvas) {
        // 기존 레코드가 있으면 count를 1 증가
        userCanvas.count += 1;
        await this.userCanvasRepository.save(userCanvas);
      } else {
        // 레코드가 없으면 새로 생성 (count = 1)
        userCanvas = this.userCanvasRepository.create({
          user: { id: userId },
          canvas: { id: canvasId },
          count: 1,
          joinedAt: new Date(),
        });
        await this.userCanvasRepository.save(userCanvas);
      }

      console.log(
        `사용자 ${userId}의 캔버스 ${canvasId} 카운트 증가: ${userCanvas.count}`
      );
    } catch (error) {
      console.error('user_canvas 카운트 증가 중 오류:', error);
      throw error;
    }
  }

  // 남은 쿨다운(초) 반환

  async getCooldownRemaining(
    userId: number,
    canvasId: string
  ): Promise<number> {
    const cooldownKey = `cooldown:${userId}:${canvasId}`;
    const ttl = await this.redisClient.ttl(cooldownKey);
    console.log(`사용자 ${userId}, 캔버스 ${canvasId} - 남은 시간: ${ttl}초`);
    return ttl > 0 ? ttl : 0; // 초
  }
}
