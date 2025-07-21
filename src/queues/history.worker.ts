import { Worker, Job } from 'bullmq';
import { Pixel } from '../pixel/entity/pixel.entity';
import { AppDataSource } from '../data-source';
import { generatorPixelToImg } from '../util/imageGenerator.util';
import { uploadBufferToS3 } from '../util/s3UploadFile.util';
import { randomUUID } from 'crypto';
import { redisClient } from './bullmq.redis';
import { redisConnection } from './bullmq.config';
import { CanvasHistory } from '../canvas/entity/canvasHistory.entity';

const pixelRepository = AppDataSource.getRepository(Pixel);
const historyRepository = AppDataSource.getRepository(CanvasHistory);

const historyWorker = new Worker(
  'canvas-history',
  async (job: Job) => {
    const { canvas_id, size_x, size_y, type } = job.data;
    const width = Number(size_x);
    const height = Number(size_y);

    if (!job.data) throw new Error('job.data is undefined');

    const hashKey = `canvas:${canvas_id}`;
    const redisPixels = await redisClient.hgetall(hashKey);

    let pixelData: Array<{ x: number; y: number; color: string }> = [];

    if (Object.keys(redisPixels).length > 0) {
      for (const field in redisPixels) {
        const [x, y] = field.split(':').map(Number);
        const value = redisPixels[field];
        let color: string;

        if (value.includes('|')) {
          // 새로운 파이프로 구분된 형태 처리
          const [colorPart] = value.split('|')[0];
          color = colorPart;
        } else {
          // 기존 color만 저장된 형태 처리 (하위 호환성)
          color = value;
        }
        pixelData.push({ x, y, color });
      }
    } else {
      pixelData = await pixelRepository.query(
        'select x, y, color from pixels where canvas_id = $1::INTEGER',
        [canvas_id]
      );
    }

    const buffer = await generatorPixelToImg(pixelData, width, height);
    const contentType = 'image/png';
    const key = `history/${canvas_id}/${randomUUID()}.png`;
    await uploadBufferToS3(buffer, key, contentType);

    const history = await historyRepository.findOne({
      where: { canvas: { id: Number(canvas_id) } },
    });

    if (!history) throw new Error('CanvasHistory not found');

    history.img_url = key;
    history.caputred_at = new Date();

    await historyRepository.save(history);

    // 캔버스 히스토리 데이터 생성 (public이 아닌 캔버스만)
    if (type !== 'public') {
      try {
        // CanvasHistoryService를 직접 호출하는 대신 SQL로 처리
        await createCanvasHistoryData(canvas_id);
      } catch (error) {
        console.error(
          `[HistoryWorker] 캔버스 ${canvas_id} 히스토리 데이터 생성 실패:`,
          error
        );
      }
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

historyWorker.on('completed', (job) => {
  console.log(`[HistoryWorker] Job 완료: ${job.id}`);
});
historyWorker.on('failed', (job, err) => {
  console.error(`[HistoryWorker] Job 실패: ${job?.id}`, err);
});
historyWorker.on('error', (err) => {
  console.error('[HistoryWorker] 워커 에러:', err);
});

// 캔버스 히스토리 데이터 생성 함수
async function createCanvasHistoryData(canvasId: number): Promise<void> {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // 1. 기본 통계 데이터 조회 (최적화된 단순 쿼리)
    const basicStatsQuery = `
      SELECT 
        COUNT(DISTINCT uc.user_id) as participant_count,
        SUM(uc.try_count) as total_try_count
      FROM user_canvas uc
      WHERE uc.canvas_id = $1
    `;
    const basicStats = await queryRunner.query(basicStatsQuery, [canvasId]);

    // 2. top_try_user 조회 (인덱스 활용)
    const topTryUserQuery = `
      SELECT uc.user_id, uc.try_count
      FROM user_canvas uc
      WHERE uc.canvas_id = $1 AND uc.try_count > 0
      ORDER BY uc.try_count DESC, uc.joined_at ASC, uc.user_id ASC
      LIMIT 1
    `;
    const topTryUser = await queryRunner.query(topTryUserQuery, [canvasId]);

    // 3. top_own_user 조회 (인덱스 활용)
    const topOwnUserQuery = `
      SELECT 
        p.owner as user_id,
        COUNT(*) as own_count
      FROM pixels p
      WHERE p.canvas_id = $1 AND p.owner IS NOT NULL
      GROUP BY p.owner
      ORDER BY COUNT(*) DESC, 
               (SELECT joined_at FROM user_canvas WHERE user_id = p.owner AND canvas_id = $1) ASC,
               p.owner ASC
      LIMIT 1
    `;
    const topOwnUser = await queryRunner.query(topOwnUserQuery, [canvasId]);

    // 4. own_count 업데이트 (최적화된 배치 업데이트)
    const updateOwnCountQuery = `
      UPDATE user_canvas uc
      SET own_count = COALESCE(
        (SELECT COUNT(*) FROM pixels p WHERE p.owner = uc.user_id AND p.canvas_id = uc.canvas_id),
        0
      )
      WHERE uc.canvas_id = $1
    `;
    await queryRunner.query(updateOwnCountQuery, [canvasId]);

    // 5. CanvasHistory 생성 또는 업데이트
    const upsertHistoryQuery = `
      INSERT INTO canvas_history (
        canvas_id, participant_count, total_try_count, 
        top_try_user_id, top_try_user_count, top_own_user_id, top_own_user_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (canvas_id) DO UPDATE SET
        participant_count = EXCLUDED.participant_count,
        total_try_count = EXCLUDED.total_try_count,
        top_try_user_id = EXCLUDED.top_try_user_id,
        top_try_user_count = EXCLUDED.top_try_user_count,
        top_own_user_id = EXCLUDED.top_own_user_id,
        top_own_user_count = EXCLUDED.top_own_user_count
    `;

    await queryRunner.query(upsertHistoryQuery, [
      canvasId,
      basicStats[0]?.participant_count || 0,
      basicStats[0]?.total_try_count || 0,
      topTryUser[0]?.user_id || null,
      topTryUser[0]?.try_count || null,
      topOwnUser[0]?.user_id || null,
      topOwnUser[0]?.own_count || null,
    ]);

    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error(
      `[Worker] 캔버스 ${canvasId} 히스토리 데이터 생성 실패:`,
      error
    );
    throw error;
  } finally {
    await queryRunner.release();
  }
}
export { historyWorker };
