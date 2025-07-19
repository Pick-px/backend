import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { createCanvasDto } from './dto/create_canvas_dto.dto';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Canvas } from './entity/canvas.entity';
import Redis from 'ioredis';
import { UserCanvas } from '../entity/UserCanvas.entity';
import { CanvasInfo } from '../interface/CanvasInfo.interface';
import { DrawPixelResponse } from '../interface/DrawPixelResponse.interface';
import { PixelInfo } from '../interface/PixelInfo.interface';
import { CanvasHistory } from './entity/canvasHistory.entity';
import { CanvasStrategyFactory } from './strategy/createFactory.factory';
import { historyQueue } from '../queues/bullmq.queue';

@Injectable()
export class CanvasService {
  constructor(
    @InjectRepository(Canvas)
    private readonly canvasRepository: Repository<Canvas>,
    @InjectRepository(CanvasHistory)
    private readonly historyRepository: Repository<CanvasHistory>,
    @InjectRepository(UserCanvas)
    private readonly userCanvasRepository: Repository<UserCanvas>,
    @Inject('REDIS_CLIENT')
    private readonly redisClient: Redis,
    private readonly strategyFactory: CanvasStrategyFactory,
    @InjectDataSource()
    private readonly dataSource: DataSource
  ) {}

  // 픽셀 저장 로직 (Redis Hash 사용 + Pipeline 최적화)
  async tryDrawPixel({
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
    console.log(
      `[tryDrawPixel] 호출: canvas_id=${canvas_id}, x=${x}, y=${y}, color=${color}, userId=${userId}`
    );
    try {
      const hashKey = `canvas:${canvas_id}`;
      const field = `${x}:${y}`;

      // color와 owner 정보만 저장 (최적화)
      const pixelData = `${color}|${userId}`;
      // Pipeline으로 3개 명령을 한 번에 처리
      const pipeline = this.redisClient.pipeline();
      pipeline.hset(hashKey, field, pixelData);
      pipeline.expire(hashKey, 3 * 24 * 60 * 60);
      pipeline.sadd(`dirty_pixels:${canvas_id}`, field);

      await pipeline.exec();

      console.log(
        `Redis: 픽셀 저장 성공: ${hashKey} ${field} = ${color} ${userId}`
      );
      return true;
    } catch (error) {
      console.error('픽셀 저장 실패:', error);
      return false;
    }
  }

  // Redis에서 픽셀 조회
  async getPixelsFromRedis(canvas_id: string): Promise<PixelInfo[]> {
    console.time('fromRedis');
    const hash = await this.redisClient.hgetall(`canvas:${canvas_id}`);
    console.timeEnd('fromRedis');
    const pixels: {
      x: number;
      y: number;
      color: string;
      owner: number | null;
    }[] = [];
    console.time('push');
    for (const key in hash) {
      const [x, y] = key.split(':').map(Number);
      const value = hash[key];

      let color: string;
      let owner: number | null = null;

      if (value.includes('|')) {
        // 새로운 파이프로 구분된 형태 처리
        const [colorPart, ownerPart] = value.split('|');
        color = colorPart;
        owner = ownerPart ? parseInt(ownerPart) : null;
      } else {
        // 기존 color만 저장된 형태 처리 (하위 호환성)
        color = value;
        owner = null;
      }

      pixels.push({ x, y, color, owner });
    }
    console.timeEnd('push');
    return pixels;
  }

  // DB에서 픽셀 조회
  async getPixelsFromDB(canvas_id: string): Promise<PixelInfo[]> {
    console.time('fromdb');
    try {
      const dbPixels: {
        x: number;
        y: number;
        color: string;
        owner: number | null;
      }[] = await this.dataSource.query(
        'SELECT x, y, color, owner FROM pixels WHERE canvas_id = $1::INTEGER',
        [canvas_id]
      );
      return dbPixels;
    } finally {
      console.timeEnd('fromdb');
    }
  }

  // 통합: Redis 우선, 없으면 DB + Redis 캐싱
  async getAllPixels(canvas_id?: string): Promise<PixelInfo[]> {
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
      const field = `${pixel.x}:${pixel.y}`;
      // DB에서 조회한 픽셀의 실제 owner 정보 사용
      const pixelData = `${pixel.color}|${pixel.owner || ''}`;
      pipeline.hset(`canvas:${realCanvasId}`, field, pixelData);
    }
    await pipeline.exec();
    // DB 픽셀을 반환 형식에 맞게 변환
    return dbPixels.map((pixel) => ({
      x: pixel.x,
      y: pixel.y,
      color: pixel.color,
      owner: pixel.owner,
    }));
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
      const value = await this.redisClient.hget(key, field);

      if (value) {
        let color: string;

        if (value.includes('|')) {
          // 새로운 파이프로 구분된 형태 처리
          const [colorPart] = value.split('|');
          color = colorPart;
        } else {
          // 기존 color만 저장된 형태 처리 (하위 호환성)
          color = value;
        }

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
           where (ended_at IS NULL OR ended_at > NOW())
           and (type like 'event%' or type = 'public')`,
          []
        );
        return result;
      } else if (status === 'inactive') {
        // 종료된 캔버스만
        const result: CanvasInfo[] = await this.dataSource.query(
          `select id as "canvasId", title, type, created_at, started_at, ended_at, size_x, size_y 
           from canvases 
           where ended_at IS NOT NULL AND ended_at <= NOW()
           and (type like 'event%' or type = 'public')`,
          []
        );
        return result;
      } else {
        // 전체 반환
        const result: CanvasInfo[] = await this.dataSource.query(
          `select id as "canvasId", title, type, created_at, started_at, ended_at, size_x, size_y 
           from canvases`,
          []
        );
        return result;
      }
    } catch (err) {
      throw new NotFoundException('DB에서 조회 실패!');
    }
  }

  async getGameList() {
    try {
      const games: CanvasInfo[] = await this.dataSource.query(
        `select id as "canvasId", title, type, created_at, started_at, ended_at, size_x, size_y
        from canvases

        where (started_at > NOW()) and type = 'game%'`
      );
      return games;
    } catch (err) {
      throw new NotFoundException('DB에서 조회 실패!');
    }
  }

  // 캔버스 생성 함수 refactor 필수
  async createCanvas(createCanvasDto: createCanvasDto): Promise<Canvas | null> {
    try {
      const strategy = this.strategyFactory.getStrategy(createCanvasDto.type);
      const canvas = await strategy.create(createCanvasDto);
      return canvas;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  async generateCanvasHistory(canvas: Canvas): Promise<void> {
    await this.historyRepository.save({
      canvasId: canvas.id,
    });
  }
  async findCanvasesEndingWithinDays(day: number) {
    const days = day;
    const canvas: Canvas[] = await this.dataSource.query(
      `SELECT id AS canvas_id, ended_at 
   FROM canvases 
   WHERE ended_at <= NOW() + ($1 || ' days')::INTERVAL`,
      [days.toString()]
    );
    return canvas;
  }

  // 캔버스 활성 상태 체크 (Redis 캐시 우선, DB 폴백)
  async isCanvasActive(canvasId: number): Promise<boolean> {
    try {
      // 1. Redis 캐시에서 조회
      const cacheKey = `canvas:active:${canvasId}`;
      const cachedData = await this.redisClient.get(cacheKey);

      if (cachedData !== null) {
        // 캐시 히트 - endedAt 시간으로 정확한 상태 계산
        const { startedAt, endedAt } = JSON.parse(cachedData);
        const now = new Date();
        const isActive =
          new Date(startedAt) <= now && (!endedAt || new Date(endedAt) > now);

        console.log(
          `[CanvasService] 캔버스 ${canvasId} 활성 상태 캐시 히트: ${isActive}`
        );
        return isActive;
      }

      // 2. DB에서 조회
      const canvas = await this.canvasRepository.findOneBy({ id: canvasId });
      if (!canvas) {
        console.log(`[CanvasService] 캔버스 ${canvasId} 존재하지 않음`);
        return false;
      }

      const now = new Date();
      const isActive =
        canvas.startedAt <= now && (!canvas.endedAt || canvas.endedAt > now);

      // 3. Redis에 캐싱 (TTL 12시간) - startedAt, endedAt 시간 저장
      const cacheData = {
        startedAt: canvas.startedAt.toISOString(),
        endedAt: canvas.endedAt?.toISOString() || null,
      };
      await this.redisClient.setex(
        cacheKey,
        12 * 60 * 60,
        JSON.stringify(cacheData)
      );
      console.log(
        `[CanvasService] 캔버스 ${canvasId} 활성 상태 DB 조회 후 캐싱: ${isActive}`
      );

      return isActive;
    } catch (error) {
      console.error(
        `[CanvasService] 캔버스 ${canvasId} 활성 상태 체크 중 오류:`,
        error
      );
      // 에러 발생 시 안전하게 비활성 처리
      return false;
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
    console.log(
      `[applyDrawPixel] 호출: canvas_id=${canvas_id}, x=${x}, y=${y}, color=${color}, userId=${userId}`
    );
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
      console.warn(
        `[applyDrawPixel] 동시성 발생! canvas-id : ${canvas_id}, ${x}:${y}`
      );
      // 이미 다른 사용자가 락을 선점한 경우
      return false;
    }

    try {
      console.log(`[applyDrawPixel] 락 획득, tryDrawPixel 호출`);
      // 실제 픽셀 저장
      return await this.tryDrawPixel({ canvas_id, x, y, color, userId });
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

  // 캔버스 타입 조회 메서드 추가
  async getCanvasType(canvas_id: string): Promise<string | null> {
    if (!canvas_id) return null;
    const idNum = Number(canvas_id);
    if (isNaN(idNum)) return null;
    const meta = await this.canvasRepository.findOneBy({ id: idNum });
    return meta?.type ?? null;
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
    // 캔버스 타입 조회
    const canvasType = await this.getCanvasType(canvas_id);
    // 캔버스 존재 여부 체크
    const canvasInfo = await this.getCanvasById(canvas_id);
    if (!canvasInfo?.metaData) {
      return {
        success: false,
        message: '관리자에 의해 삭제된 캔버스입니다.',
      };
    }
    // 게임 모드면 쿨다운 1초, 그 외는 3초
    const cooldownSeconds = canvasType === 'game_calculation' ? 1 : 3;
    console.log(
      `[CanvasService] 쿨다운 설정: canvasType=${canvasType}, cooldownSeconds=${cooldownSeconds}`
    );

    // 게임 캔버스인 경우 게임 시간 체크
    if (canvasType === 'game_calculation') {
      const now = new Date();

      if (
        canvasInfo?.metaData?.startedAt &&
        now < canvasInfo.metaData.startedAt
      ) {
        console.log(
          `[CanvasService] 게임 시작 전 색칠 시도 차단: userId=${userId}, canvasId=${canvas_id}`
        );
        return {
          success: false,
          message: '게임이 아직 시작되지 않았습니다.',
        };
      }

      if (canvasInfo?.metaData?.endedAt && now > canvasInfo.metaData.endedAt) {
        console.log(
          `[CanvasService] 게임 종료 후 색칠 시도 차단: userId=${userId}, canvasId=${canvas_id}`
        );
        return {
          success: false,
          message: '게임이 이미 종료되었습니다.',
        };
      }
    }

    // 캔버스 활성 상태 먼저 체크
    const isActive = await this.isCanvasActive(parseInt(canvas_id));
    console.log(
      `[CanvasService] 사용자 ${userId}가 캔버스 ${canvas_id}에 색칠 시도 - 활성 상태: ${isActive}`
    );
    if (!isActive) {
      console.log(
        `[CanvasService] 사용자 ${userId}가 비활성 캔버스 ${canvas_id}에 색칠 시도 차단`
      );
      return {
        success: false,
        message: '시작되지 않았거나 종료된 캔버스입니다',
      };
    }
    const cooldownKey = `cooldown:${userId}:${canvas_id}`;

    // 남은 쿨다운 확인 (Redis TTL 사용)
    const ttl = await this.redisClient.ttl(cooldownKey);
    console.log(
      `[CanvasService] 쿨다운 확인: userId=${userId}, canvasId=${canvas_id}, ttl=${ttl}`
    );

    if (ttl > 0) {
      console.log(
        `[CanvasService] 쿨다운 중: userId=${userId}, remaining=${ttl}`
      );
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

    if (result) {
      // 쿨다운 설정
      await this.redisClient.setex(cooldownKey, cooldownSeconds, '1');
      console.log(
        `[CanvasService] 쿨다운 설정 완료: userId=${userId}, canvasId=${canvas_id}, seconds=${cooldownSeconds}`
      );
    }

    // draw-pixel 이벤트가 처리되었으므로 user_canvas의 count를 1 증가
    try {
      await this.incrementUserCanvasCount(userId, parseInt(canvas_id));
      console.log(
        `[CanvasService] 유저 캔버스 카운트 증가 완료: userId=${userId}, canvasId=${canvas_id}`
      );
    } catch (error) {
      console.error('사용자 캔버스 카운트 증가 실패:', error);
      // 카운트 증가 실패는 로그만 남기고 픽셀 그리기는 계속 진행
    }

    return { success: result, message: result ? '성공' : '실패' };
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

  // user_canvas 테이블의 try_count를 1씩 증가시키는 메서드
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
        // 기존 레코드가 있으면 try_count를 1 증가
        userCanvas.tryCount += 1;
        await this.userCanvasRepository.save(userCanvas);
      } else {
        // 레코드가 없으면 새로 생성 (try_count = 1)
        userCanvas = this.userCanvasRepository.create({
          user: { id: userId },
          canvas: { id: canvasId },
          tryCount: 1,
          joinedAt: new Date(),
        });
        await this.userCanvasRepository.save(userCanvas);
      }

      console.log(
        `사용자 ${userId}의 캔버스 ${canvasId} try_count 증가: ${userCanvas.tryCount}`
      );
    } catch (error) {
      console.error('user_canvas try_count 증가 중 오류:', error);
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

  async isActiveGameCanvas(canvasId: number): Promise<boolean> {
    const canvas = await this.canvasRepository.findOne({
      where: { id: canvasId },
    });

    if (!canvas) throw new NotFoundException('캔버스 정보가 없습니다.');

    const now = Date.now(); // 현재 시각 (timestamp)
    const startedAt = canvas.startedAt.getTime(); // Date → timestamp

    // 시작 전에만 입장 가능
    const isActive = now <= startedAt;

    return isActive;
  }

  // 캔버스 및 연관 데이터 하드 딜리트
  async deleteCanvasById(canvasId: number | string): Promise<boolean> {
    const id = Number(canvasId);
    if (isNaN(id)) return false;
    const result = await this.canvasRepository.delete(id);
    return (result.affected ?? 0) > 0;
  }

  // 강제 종료: ended_at을 현재로 업데이트
  async forceEndCanvas(canvasId: number | string): Promise<boolean> {
    const id = Number(canvasId);
    if (isNaN(id)) return false;
    const now = new Date();
    const result = await this.canvasRepository.update(id, { endedAt: now });
    // ended_at을 now로 바꾼 후, 5초 delay로 historyQueue에 잡 등록
    const canvas = await this.canvasRepository.findOneBy({ id });
    if (canvas) {
      await historyQueue.add(
        'canvas-history',
        {
          canvas_id: id,
          size_x: canvas.sizeX,
          size_y: canvas.sizeY,
          type: canvas.type,
        },
        { jobId: `history-${id}`, delay: 5000 }
      );
    }
    return (result.affected ?? 0) > 0;
  }
}
