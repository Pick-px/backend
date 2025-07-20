import { Worker } from 'bullmq';
import { config } from 'dotenv';
import { AppDataSource } from '../data-source';
import { redisConnection } from './bullmq.config';
import { Pixel } from '../pixel/entity/pixel.entity';
import Redis from 'ioredis';
import { Chat } from '../group/entity/chat.entity';
import { PixelInfo } from '../interface/PixelInfo.interface';
import './history.worker';

config();

async function initializeDataSourceWithRetry(
  retries = 3,
  delay = 2000
): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[DB] 데이터베이스 연결 시도 ${attempt}/${retries}...`);
      await AppDataSource.initialize();
      console.log('[DB] 데이터베이스 연결 성공');
      return;
    } catch (error) {
      console.error(`[DB] 연결 실패 (시도 ${attempt}/${retries}):`, error);
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.error('[DB] 최대 재시도 횟수 도달. 종료합니다.');
        process.exit(1);
      }
    }
  }
}

type PixelGenerationJobData = {
  canvas_id: number;
  size_x: number;
  size_y: number;
  startedAt: Date;
  endedAt: Date;
  created_at: Date;
  updated_at: Date;
};

let worker: Worker<PixelGenerationJobData>;
let redis: Redis;

// 배치 처리를 위한 큐 (전체 통합 - 대용량 처리용)
const pixelBatchQueue: Set<string> = new Set();
const chatBatchQueue: any[] = [];

// 배치 처리 설정 (대용량 최적화)
const PIXEL_BATCH_SIZE = 200; // 픽셀 배치 크기
const CHAT_BATCH_SIZE = 100; // 채팅 배치 크기
const BATCH_TIMEOUT_MS = 2000; // 10초

// 픽셀 변경사항을 배치에 추가 (전체 통합 + 중복 제거)
async function addPixelToBatch(
  canvasId: number,
  x: number,
  y: number,
  color: string,
  owner: number | null = null
) {
  // 기존 같은 픽셀 제거 (최신 색상만 유지)
  const pixelKey = `${canvasId}:${x}:${y}`;
  for (const existingPixel of pixelBatchQueue) {
    if (existingPixel.startsWith(pixelKey + ':')) {
      pixelBatchQueue.delete(existingPixel);
      break;
    }
  }

  const pixelData = `${pixelKey}:${color}:${owner === null || (typeof owner === 'string' && owner === '') ? '' : Number(owner)}`;
  pixelBatchQueue.add(pixelData);

  // 배치 크기 도달 시 즉시 flush
  if (pixelBatchQueue.size >= PIXEL_BATCH_SIZE) {
    // console.log(
    //   `[Worker] 픽셀 배치 크기 도달으로 즉시 flush: 개수=${pixelBatchQueue.size}`
    // );
    await flushPixelBatch();
  }
}

// 채팅 메시지를 배치에 추가 (전체 통합)
async function addChatToBatch(groupId: number, chatData: any) {
  chatBatchQueue.push({ groupId, chatData });

  // 배치 크기 도달 시 즉시 flush
  if (chatBatchQueue.length >= CHAT_BATCH_SIZE) {
    await flushChatBatch();
  }
}

// 픽셀 배치 flush (전체 통합)
async function flushPixelBatch(isForceFlush: boolean = false) {
  if (pixelBatchQueue.size === 0) return;

  try {
    // const pixelRepo = AppDataSource.getRepository(Pixel);
    const CHUNK_SIZE = 100;

    // 캔버스별로 그룹화
    const canvasGroups = new Map<number, Array<PixelInfo>>();

    for (const pixelData of pixelBatchQueue) {
      const [canvasId, x, y, color, owner] = pixelData.split(':');
      const cid = Number(canvasId);
      if (!canvasGroups.has(cid)) {
        canvasGroups.set(cid, []);
      }
      canvasGroups.get(cid)!.push({
        x: Number(x),
        y: Number(y),
        color,
        owner:
          owner === undefined ||
          owner === null ||
          (typeof owner === 'string' && owner === '')
            ? null
            : Number(owner),
      });
    }

    pixelBatchQueue.clear();

    // let queryRunner: QueryRunner;
    for (const [canvasId, pixels] of canvasGroups) {
      // chunk 단위로 나눠서 처리
      for (let i = 0; i < pixels.length; i += CHUNK_SIZE) {
        const queryRunner = AppDataSource.createQueryRunner();
        let chunk: PixelInfo[] = []; // 바깥에서 선언
        try {
          await queryRunner.connect();
          await queryRunner.startTransaction();
          chunk = pixels.slice(i, i + CHUNK_SIZE);

          const whereClauseParts: string[] = [];
          const caseClauseParts: string[] = [];
          const values: any[] = [];

          // (canvas_id, x, y) WHERE 조건 및 파라미터
          chunk.forEach((p, idx) => {
            const baseIdx = idx * 3;
            // IN 조건용 (canvas_id, x, y)
            whereClauseParts.push(
              `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3})`
            );
            values.push(canvasId, p.x, p.y);
          });

          // CASE WHEN ... THEN ... 및 색상, owner, updated_at 파라미터
          chunk.forEach((p, idx) => {
            const baseIdx = idx * 3;
            const colorIdx = chunk.length * 3 + idx * 3 + 1;
            const ownerIdx = chunk.length * 3 + idx * 3 + 2;
            const updatedAtIdx = chunk.length * 3 + idx * 3 + 3;

            // CASE 조건에 색상, owner, updated_at 파라미터 추가
            caseClauseParts.push(
              `WHEN canvas_id = $${baseIdx + 1} AND x = $${baseIdx + 2} AND y = $${baseIdx + 3} THEN $${colorIdx}`
            );
            values.push(
              p.color,
              p.owner === null ||
                p.owner === undefined ||
                (typeof p.owner === 'string' && p.owner === '')
                ? null
                : Number(p.owner),
              new Date().toISOString()
            );
          });

          const query = `
            UPDATE pixels
            SET color = CASE
              ${caseClauseParts.join('\n')}
            END,
            owner = CASE
              ${caseClauseParts
                .map((_, idx) => {
                  const baseIdx = idx * 3;
                  const ownerIdx = chunk.length * 3 + idx * 3 + 2;
                  return `WHEN canvas_id = $${baseIdx + 1} AND x = $${baseIdx + 2} AND y = $${baseIdx + 3} THEN CAST($${ownerIdx} AS BIGINT)`;
                })
                .join('\n')}
            END,
            updated_at = CASE
              ${caseClauseParts
                .map((_, idx) => {
                  const baseIdx = idx * 3;
                  const updatedAtIdx = chunk.length * 3 + idx * 3 + 3;
                  return `WHEN canvas_id = $${baseIdx + 1} AND x = $${baseIdx + 2} AND y = $${baseIdx + 3} THEN CAST($${updatedAtIdx} AS TIMESTAMP)`;
                })
                .join('\n')}
            END
            WHERE (canvas_id, x, y) IN (${whereClauseParts.join(', ')})
          `;

          await queryRunner.query(query, values);
          await queryRunner.commitTransaction();
        } catch (err) {
          console.error(err);
          await queryRunner.rollbackTransaction();
          for (const pixel of chunk) {
            pixelBatchQueue.add(
              `${canvasId}:${pixel.x}:${pixel.y}:${pixel.color}:${pixel.owner ?? ''}`
            );
          }
          continue;
        } finally {
          await queryRunner.release();
        }
      }
    }

    const flushType = isForceFlush ? '강제 flush' : '즉시 flush';
    // pixelBatchQueue.clear();

    // 픽셀 플러시 후 dirty_pixels set 비우기
    for (const canvasId of canvasGroups.keys()) {
      if (redis) {
        await redis.del(`dirty_pixels:${canvasId}`);
      }
    }
  } catch (error) {
    console.error(`[Worker] 픽셀 배치 flush 에러:`, error);
    pixelBatchQueue.clear();
  }
}

// 채팅 배치 flush (전체 통합)
async function flushChatBatch(isForceFlush: boolean = false) {
  if (chatBatchQueue.length === 0) return;

  try {
    const chatRepo = AppDataSource.getRepository(Chat);
    const chatsToInsert = chatBatchQueue.map(({ groupId, chatData }) => ({
      groupId,
      userId: chatData.user.id,
      message: chatData.message,
      createdAt: new Date(chatData.created_at),
    }));

    await chatRepo.save(chatsToInsert);
    const flushType = isForceFlush ? '강제 flush' : '즉시 flush';
    // flush 후 각 그룹별로 Redis 동기화
    const groupIds = [...new Set(chatBatchQueue.map(({ groupId }) => groupId))];
    for (const groupId of groupIds) {
      await syncRedisChatAfterFlush(groupId);
    }

    chatBatchQueue.length = 0; // 배열 비우기
  } catch (error) {
    console.error(`[Worker] 채팅 배치 flush 에러:`, error);
  }
}

// === flush 후 groupId별로 레디스 동기화 함수 ===
async function syncRedisChatAfterFlush(groupId: number) {
  const chatRepo = AppDataSource.getRepository(Chat);
  // 최신 50개 채팅을 DB에서 조회
  const chats = await chatRepo.find({
    where: { groupId },
    order: { createdAt: 'DESC' },
    take: 50,
    relations: ['user'],
  });
  const chatKey = `chat:${Number(groupId)}`;
  // Redis에 저장할 포맷으로 변환
  const chatPayloads = chats.map((chat) => ({
    id: chat.id,
    user: { id: chat.user.id, user_name: chat.user.userName },
    message: chat.message,
    created_at: chat.createdAt.toISOString(),
  }));
  // Redis에 저장(기존 데이터 삭제 후)
  await redis.del(chatKey);
  if (chatPayloads.length > 0) {
    await redis.lpush(chatKey, ...chatPayloads.map((p) => JSON.stringify(p)));
    await redis.ltrim(chatKey, 0, 49);
    await redis.expire(chatKey, 12 * 60 * 60);
  }
}

// 주기적 강제 flush (안전장치)
const forceFlushInterval = setInterval(async () => {
  let totalPixelFlushCount = 0;
  let totalChatFlushCount = 0;

  if (pixelBatchQueue.size > 0) {
    totalPixelFlushCount = pixelBatchQueue.size;
    await flushPixelBatch(true);
  }

  if (chatBatchQueue.length > 0) {
    totalChatFlushCount = chatBatchQueue.length;
    await flushChatBatch(true);
  }
}, BATCH_TIMEOUT_MS);

// Redis 이벤트 리스너 설정
async function setupRedisEventListeners() {
  // 픽셀 변경 이벤트 구독 (기본 Redis 사용)
  const pixelSubscriber = new Redis(redisConnection);
  await pixelSubscriber.subscribe('pixel:updated');

  pixelSubscriber.on('message', async (channel, message) => {
    try {
      const { canvasId, x, y, color, owner } = JSON.parse(message);
      await addPixelToBatch(canvasId, x, y, color, owner);
    } catch (error) {
      console.error('[Worker] 픽셀 이벤트 처리 에러:', error);
    }
  });

  // 채팅 메시지 이벤트 구독 (기본 Redis 사용)
  const chatSubscriber = new Redis(redisConnection);
  await chatSubscriber.subscribe('chat:message');

  chatSubscriber.on('message', async (channel, message) => {
    try {
      const { groupId, chatData } = JSON.parse(message);
      await addChatToBatch(groupId, chatData);
    } catch (error) {
      console.error('[Worker] 채팅 이벤트 처리 에러:', error);
    }
  });

  // === 3개 Redis 분리 이벤트 리스너 ===
  /*
  // 픽셀 변경 이벤트 구독 (픽셀 전용 Redis 사용)
  const pixelRedisConfig = {
    host: process.env.REDIS_PIXEL_HOST || 'redis-pixel',
    port: parseInt(process.env.REDIS_PIXEL_PORT || '6379', 10),
    password: process.env.REDIS_PIXEL_PASSWORD || undefined,
    lazyConnect: true,
  };
  const pixelSubscriber = new Redis(pixelRedisConfig);
  await pixelSubscriber.subscribe('pixel:updated');
  
  pixelSubscriber.on('message', async (channel, message) => {
    try {
      const { canvasId, x, y, color } = JSON.parse(message);
      await addPixelToBatch(canvasId, x, y, color);
    } catch (error) {
      console.error('[Worker] 픽셀 이벤트 처리 에러:', error);
    }
  });
  
  // 채팅 메시지 이벤트 구독 (채팅 전용 Redis 사용)
  const chatRedisConfig = {
    host: process.env.REDIS_CHAT_HOST || 'redis-chat',
    port: parseInt(process.env.REDIS_CHAT_PORT || '6379', 10),
    password: process.env.REDIS_CHAT_PASSWORD || undefined,
    lazyConnect: true,
  };
  const chatSubscriber = new Redis(chatRedisConfig);
  await chatSubscriber.subscribe('chat:message');
  
  chatSubscriber.on('message', async (channel, message) => {
    try {
      const { groupId, chatData } = JSON.parse(message);
      await addChatToBatch(groupId, chatData);
    } catch (error) {
      console.error('[Worker] 채팅 이벤트 처리 에러:', error);
    }
  });
  */
}

// 워커 및 리소스 종료 처리
async function gracefulShutdown() {
  // console.log('[Worker] 종료 신호 수신, 정리 작업 시작...');
  clearInterval(forceFlushInterval);

  // 남은 배치들 강제 flush
  await flushPixelBatch();
  await flushChatBatch();

  if (worker) await worker.close();
  if (redis) await redis.quit();
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(0);
}
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// 메인 워커 실행
void (async () => {
  try {
    // console.log('[Worker] 워커 프로세스 시작...');
    redis = new Redis(redisConnection);
    await redis.ping();
    // console.log('[Worker] Redis 연결 성공');
    // await AppDataSource.initialize();
    await initializeDataSourceWithRetry();
    // console.log('[Worker] DataSource 초기화 완료');

    // Redis 이벤트 리스너 설정
    await setupRedisEventListeners();
    // console.log('[Worker] Redis 이벤트 리스너 설정 완료');

    worker = new Worker<PixelGenerationJobData>(
      'pixel-generation',
      async (job) => {
        try {
          const start = Date.now();
          const {
            canvas_id,
            size_x,
            size_y,
            startedAt,
            endedAt,
            created_at,
            updated_at,
          } = job.data;
          // console.log(
          //   `[Worker] Job 시작: canvas_id=${canvas_id}, size=${size_x}x${size_y}`
          // );
          const pixels: Pixel[] = [];
          for (let y = 0; y < size_y; y++) {
            for (let x = 0; x < size_x; x++) {
              const pixel = new Pixel();
              pixel.canvasId = canvas_id;
              pixel.x = x;
              pixel.y = y;
              pixel.createdAt = created_at;
              pixel.updatedAt = updated_at;
              pixel.color = '#000000';
              pixel.owner = null;
              pixels.push(pixel);
            }
          }
          const pixelRepo = AppDataSource.getRepository(Pixel);
          const chunkSize = 5000;
          for (let i = 0; i < pixels.length; i += chunkSize) {
            const chunk = pixels.slice(i, i + chunkSize);
            await pixelRepo
              .createQueryBuilder()
              .insert()
              .into(Pixel)
              .values(chunk)
              .execute();
          }
          const duration = Date.now() - start;
          console.log(
            `[Worker] Pixel 작업 완료 (${pixels.length}개) - ${duration}ms`
          );
        } catch (error) {
          console.error(`[Worker] Job 처리 중 에러:`, error);
          throw error;
        }
      },
      {
        concurrency: 8,
        connection: {
          ...redisConnection,
          commandTimeout: 30000,
          connectTimeout: 30000,
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      }
    );
    worker.on('completed', (job) => {
      console.log(`[Worker] Job 완료: ${job.id}`);
    });
    worker.on('failed', (job, err) => {
      console.error(`[Worker] Job 실패: ${job?.id}`, err);
    });
    worker.on('error', (err) => {
      console.error('[Worker] 워커 에러:', err);
    });

    console.log('[Worker] 워커 시작 완료, job 대기 중...');
  } catch (error) {
    console.error('[Worker] 초기화 실패:', error);
    process.exit(1);
  }
})();

// 이벤트 발행 헬퍼 함수들
export async function publishPixelUpdate(
  canvasId: number,
  x: number,
  y: number,
  color: string,
  owner: number | null = null
) {
  try {
    await redis.publish(
      'pixel:updated',
      JSON.stringify({ canvasId, x, y, color, owner })
    );
  } catch (error) {
    console.error('[Worker] 픽셀 이벤트 발행 에러:', error);
  }
}

export async function publishChatMessage(groupId: number, chatData: any) {
  try {
    await redis.publish('chat:message', JSON.stringify({ groupId, chatData }));
  } catch (error) {
    console.error('[Worker] 채팅 이벤트 발행 에러:', error);
  }
}

export { worker };
