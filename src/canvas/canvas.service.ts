import {
  Injectable,
  Inject,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
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
import { CanvasInfo } from '../interface/CanvasInfo.interface';

@Injectable()
export class CanvasService {
  constructor(
    @InjectRepository(Canvas)
    private readonly canvasRepository: Repository<Canvas>,
    @InjectRepository(Pixel)
    private readonly pixelRepository: Repository<Pixel>,
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @Inject('REDIS_CLIENT')
    private readonly redisClient: Redis,
    @InjectDataSource()
    private readonly dataSource: DataSource
  ) {}

  // 픽셀 저장 로직 (Redis Hash 사용)
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

      // Redis Hash에 픽셀 저장
      await this.redisClient.hset(hashKey, field, color);

      // Hash 전체에 TTL 설정 (3일)
      await this.redisClient.expire(hashKey, 3 * 24 * 60 * 60);

      // 워커를 위한 dirty_pixels set에 추가 (DB flush용)
      await this.redisClient.sadd(`dirty_pixels:${canvas_id}`, `${x}:${y}`);

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
        order: { id: 'DESC' },
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
      const bool: boolean = status === 'active' ? true : false;
      const result: CanvasInfo[] = await this.dataSource.query(
        `select id as "canvasId", title, type, created_at, ended_at, size_x, size_y from canvases where is_active = $1::boolean`,
        [bool]
      );
      return result;
    } catch (err) {
      throw new NotFoundException('DB에서 조회 실패!');
    }
  }

  // 캔버스 생성 함수 refactor 필수
  async createCanvas(createCanvasDto: createCanvasDto): Promise<Canvas | null> {
    const { title, type, size_x, size_y, endedAt } = createCanvasDto;

    // 캔버스 엔티티 생성
    const canvas = this.canvasRepository.create({
      title: title,
      type: type,
      sizeX: size_x,
      sizeY: size_y,
      createdAt: new Date(),
      endedAt: endedAt,
      is_active: true,
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

  // 픽셀 그리기 적용 함수
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
    // 동시성 제어 여기서 해야할 듯?
    const lockKey = `lock:${canvas_id}:${x}:${y}`;
    const lockUser = userId.toString();
    const ttl = 1000;

    const is_locked = await this.redisClient.set(
      lockKey,
      lockUser,
      'PX',
      ttl,
      'NX'
    );

    if (!is_locked) {
      console.warn(`동시성 발생! canvas-id : ${canvas_id}, ${x}:${y}`);
      return false;
    }

    try {
      return await this.tryDrawPixel({ canvas_id, x, y, color });
    } finally {
      await this.releaseRedisLock(lockKey, lockUser);
    }
  }

  async releaseRedisLock(lockKey: string, lockUser: string) {
    return await this.redisClient.eval(
      `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `,
      1,
      lockKey,
      lockUser
    );
  }

  // 캔버스 ID로 캔버스 정보 조회
  async getCanvasById(canvas_id?: string) {
    let realCanvasId = canvas_id;
    if (!realCanvasId) {
      // 기본 캔버스 조회
      const canvases = await this.canvasRepository.find({
        order: { id: 'DESC' },
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
  }): Promise<any> {
    const cooldownKey = `cooldown:${userId}:${canvas_id}`;
    const cooldownSeconds = 20;

    // 남은 쿨다운 확인 (Redis TTL 사용)
    const ttl = await this.redisClient.ttl(cooldownKey);

    if (ttl > 0) {
      return { success: false, message: '쿨다운 중', remaining: ttl };
    }

    // 픽셀 그리기 적용
    const result = await this.applyDrawPixel({
      canvas_id,
      x,
      y,
      color,
      userId,
    });
    if (result) {
      await this.redisClient.setex(cooldownKey, cooldownSeconds, '1');
      return { success: true, cooldown: cooldownSeconds };
    } else {
      return { success: false, message: '픽셀 저장 실패' };
    }
  }

  // 남은 쿨다운(초) 반환

  async getCooldownRemaining(
    userId: number,
    canvasId: string
  ): Promise<number> {
    const cooldownKey = `cooldown:${userId}:${canvasId}`;
    const ttl = await this.redisClient.ttl(cooldownKey);
    console.log(
      `[쿨다운 조회] 사용자 ${userId}, 캔버스 ${canvasId} - 남은 시간: ${ttl}초`
    );
    return ttl > 0 ? ttl : 0; // 초
  }
}
