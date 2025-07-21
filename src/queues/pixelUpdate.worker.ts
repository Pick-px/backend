import { Job, Worker } from 'bullmq';
import { AppDataSource } from '../data-source';
import { redisConnection } from './bullmq.config';

const PIXEL_BATCH_SIZE = 200;
const CHUNK_SIZE = 100; // 대량 업데이트 시 청크 처리
const BATCH_TIMEOUT_MS = 1000;

interface PixelUpdate {
  canvasId: number;
  x: number;
  y: number;
  color: string;
  owner: number | null;
}

// 데이터 저장 구조
const pixelUpdateMap = new Map<string, PixelUpdate>();

// BullMQ 워커 설정
const updateWorker = new Worker(
  'pixel-update',
  async (job: Job) => {
    const data: PixelUpdate = job.data as PixelUpdate;

    // 픽셀 데이터 큐에 추가 (중복 자동 제거)
    const key = `${data.canvasId}:${data.x}:${data.y}`;
    pixelUpdateMap.set(key, data);

    // 배치 크기 도달 시 즉시 flush
    if (pixelUpdateMap.size >= PIXEL_BATCH_SIZE) {
      await flushPixelToDb();
    }
  },
  {
    concurrency: 4,
    connection: {
      ...redisConnection,
      commandTimeout: 30000,
      connectTimeout: 30000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  }
);

// 개선된 flushPixelToDb 함수
async function flushPixelToDb() {
  if (pixelUpdateMap.size === 0) return;

  // 현재 맵의 스냅샷 생성 (안전한 처리를 위해)
  const pixelsToProcess = Array.from(pixelUpdateMap.values());
  pixelUpdateMap.clear();

  // 캔버스별로 그룹화
  const canvasGroups = new Map<number, PixelUpdate[]>();
  for (const pixel of pixelsToProcess) {
    const canvasId = pixel.canvasId;
    if (!canvasGroups.has(canvasId)) {
      canvasGroups.set(canvasId, []);
    }
    canvasGroups.get(canvasId)!.push(pixel);
  }

  const now = new Date();

  // 각 캔버스별로 처리
  for (const [canvasId, pixels] of canvasGroups.entries()) {
    // 청크 단위로 나누어 처리 (대량 데이터 처리 시 필요)
    for (let i = 0; i < pixels.length; i += CHUNK_SIZE) {
      const chunk = pixels.slice(i, i + CHUNK_SIZE);

      const queryRunner = AppDataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        // SQL 쿼리 파라미터 준비
        const params: any[] = [];
        let paramIndex = 1;

        // 픽셀 좌표 조건 생성
        const coordConditions = chunk
          .map((p) => {
            const condition = `(x = $${paramIndex} AND y = $${paramIndex + 1})`;
            params.push(p.x, p.y);
            paramIndex += 2;
            return condition;
          })
          .join(' OR ');

        // 색상 및 소유자 업데이트를 위한 CASE 문
        const colorCases = chunk
          .map((p) => {
            const caseStr = `WHEN x = $${params.indexOf(p.x) + 1} AND y = $${params.indexOf(p.y) + 1} THEN $${paramIndex}`;
            params.push(p.color);
            paramIndex++;
            return caseStr;
          })
          .join('\n');

        const ownerCases = chunk
          .map((p) => {
            const caseStr = `WHEN x = $${params.indexOf(p.x) + 1} AND y = $${params.indexOf(p.y) + 1} THEN $${paramIndex}`;
            params.push(p.owner === null ? null : Number(p.owner));
            paramIndex++;
            return caseStr;
          })
          .join('\n');

        // 최종 쿼리
        const query = `
          UPDATE pixels
          SET 
            color = CASE
              ${colorCases}
              ELSE color
            END,
            owner = CASE
              ${ownerCases}
              ELSE owner
            END,
            updated_at = $${paramIndex}
          WHERE canvas_id = $${paramIndex + 1}
          AND (${coordConditions})
        `;

        // 추가 파라미터
        params.push(now, canvasId);

        // 쿼리 실행
        await queryRunner.query(query, params);
        await queryRunner.commitTransaction();

        // console.log(
        //   `[PixelUpdate] 청크 처리 완료: canvasId=${canvasId}, ${chunk.length}개 픽셀`
        // );
      } catch (error) {
        await queryRunner.rollbackTransaction();
        console.error(
          `[PixelUpdate] 청크 처리 실패: canvasId=${canvasId}`,
          error
        );
      } finally {
        await queryRunner.release();
      }
    }
  }
}

// 주기적 flush 설정
setInterval(() => {
  if (pixelUpdateMap.size > 0) {
    flushPixelToDb();
  }
}, BATCH_TIMEOUT_MS);

// 메모리 모니터링
setInterval(() => {
  const memUsage = process.memoryUsage();
  console.log(
    `[PixelUpdate] 메모리: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB, 큐 크기: ${pixelUpdateMap.size}픽셀`
  );
}, 60000);

// 이벤트 리스너 추가
// updateWorker.on('completed', (job) => {
//   console.log(`[PixelUpdate] 작업 완료: ${job.id}`);
// });

updateWorker.on('failed', (job, err) => {
  console.error(`[PixelUpdate] 작업 실패: ${job?.id}`, err);
});

updateWorker.on('error', (err) => {
  console.error('[PixelUpdate] 워커 에러:', err);
});

updateWorker.on('stalled', (jobId) => {
  console.warn(`[PixelUpdate] 작업 지연: ${jobId}`);
});

export { updateWorker };
