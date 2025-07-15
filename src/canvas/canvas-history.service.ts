import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Canvas } from './entity/canvas.entity';
import { UserCanvas } from '../entity/UserCanvas.entity';
import { Pixel } from '../pixel/entity/pixel.entity';
import { CanvasHistory } from './entity/canvasHistory.entity';
import { User } from '../user/entity/user.entity';
import { AwsService } from '../aws/aws.service';

@Injectable()
export class CanvasHistoryService {
  constructor(
    @InjectRepository(Canvas)
    private readonly canvasRepository: Repository<Canvas>,
    @InjectRepository(UserCanvas)
    private readonly userCanvasRepository: Repository<UserCanvas>,
    @InjectRepository(Pixel)
    private readonly pixelRepository: Repository<Pixel>,
    @InjectRepository(CanvasHistory)
    private readonly canvasHistoryRepository: Repository<CanvasHistory>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly awsService: AwsService // AwsService DI 추가
  ) {}

  /**
   * 캔버스 종료 시 히스토리 데이터 생성
   * 최적화된 단순 쿼리로 처리
   * 동점자 처리: joined_at 빠른 순, user_id 작은 순
   */
  async createCanvasHistory(canvasId: number): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. 캔버스 정보 조회
      const canvas = await this.canvasRepository.findOne({
        where: { id: canvasId }
      });
      if (!canvas) throw new Error('Canvas not found');

      // 2. 기본 통계 데이터 조회
      const basicStatsQuery = `
        SELECT 
          COUNT(DISTINCT uc.user_id) as participant_count,
          SUM(uc.try_count) as total_try_count
        FROM user_canvas uc
        WHERE uc.canvas_id = $1
      `;
      const basicStats = await queryRunner.query(basicStatsQuery, [canvasId]);

      // 3. top_try_user 조회 (인덱스 활용)
      const topTryUserQuery = `
        SELECT uc.user_id, uc.try_count
        FROM user_canvas uc
        WHERE uc.canvas_id = $1 AND uc.try_count > 0
        ORDER BY uc.try_count DESC, uc.joined_at ASC, uc.user_id ASC
        LIMIT 1
      `;
      const topTryUser = await queryRunner.query(topTryUserQuery, [canvasId]);

      // 4. top_own_user 조회 (인덱스 활용)
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

      // 5. own_count 업데이트 (최적화된 배치 업데이트)
      const updateOwnCountQuery = `
        UPDATE user_canvas uc
        SET own_count = COALESCE(
          (SELECT COUNT(*) FROM pixels p WHERE p.owner = uc.user_id AND p.canvas_id = uc.canvas_id),
          0
        )
        WHERE uc.canvas_id = $1
      `;
      await queryRunner.query(updateOwnCountQuery, [canvasId]);

      // 6. CanvasHistory 생성
      const canvasHistory = this.canvasHistoryRepository.create({
        canvasId,
        participantCount: basicStats[0]?.participant_count || 0,
        totalTryCount: basicStats[0]?.total_try_count || 0,
        topTryUserId: topTryUser[0]?.user_id || null,
        topTryUserCount: topTryUser[0]?.try_count || null,
        topOwnUserId: topOwnUser[0]?.user_id || null,
        topOwnUserCount: topOwnUser[0]?.own_count || null
      });

      await this.canvasHistoryRepository.save(canvasHistory);
      await queryRunner.commitTransaction();

      console.log(`[CanvasHistoryService] 캔버스 ${canvasId} 히스토리 생성 완료 (최적화됨)`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`[CanvasHistoryService] 캔버스 ${canvasId} 히스토리 생성 실패:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * 갤러리 API용 데이터 조회
   */
  async getGalleryData(): Promise<any[]> {
    const query = `
      SELECT 
        c.id,
        c.title,
        c.type,
        c.created_at,
        c.ended_at,
        c.size_x,
        c.size_y,
        ch.participant_count,
        ch.total_try_count,
        ch.top_try_user_count,
        ch.top_own_user_count,
        ch.image_url as image_url,
        top_try_user.user_name as top_try_user_name,
        top_own_user.user_name as top_own_user_name
      FROM canvases c
      LEFT JOIN canvas_history ch ON c.id = ch.canvas_id
      LEFT JOIN users top_try_user ON ch.top_try_user_id = top_try_user.id
      LEFT JOIN users top_own_user ON ch.top_own_user_id = top_own_user.id
      WHERE c.ended_at IS NOT NULL 
        AND c.ended_at <= NOW()
        AND c.type IN ('event', 'game')
      ORDER BY c.ended_at DESC
    `;

    const results = await this.dataSource.query(query);
    // presigned URL 변환 (비동기 map)
    return await Promise.all(results.map(async row => {
      let presignedUrl: string | null = null;
      if (row.image_url) {
        try {
          presignedUrl = await this.awsService.getPreSignedUrl(row.image_url);
          console.log(`[GalleryData] presignedUrl 생성: key=${row.image_url}, url=${presignedUrl}`);
        } catch (e) {
          console.error(`[GalleryData] presignedUrl 생성 실패: key=${row.image_url}`, e);
          presignedUrl = null;
        }
      } else {
        console.log(`[GalleryData] image_url 없음: row=`, row);
      }
      return {
        image_url: presignedUrl,
        title: row.title,
        type: row.type,
        created_at: row.created_at,
        ended_at: row.ended_at,
        size_x: row.size_x,
        size_y: row.size_y,
        participant_count: row.participant_count,
        total_try_count: row.total_try_count,
        top_try_user_name: row.top_try_user_name ?? null,
        top_try_user_count: row.top_try_user_count ?? null,
        top_own_user_name: row.top_own_user_name ?? null,
        top_own_user_count: row.top_own_user_count ?? null
      };
    }));
  }
} 