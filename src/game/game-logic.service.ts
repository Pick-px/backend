// 게임 캔버스(특히 game_calculation 타입)의 핵심 게임 로직 전담
// 정답/오답 처리(색칠, 소유권 이동, own_count/try_count 관리)
// 오답 시 라이프 차감 및 사망 처리(픽셀 해제, 사망자 브로드캐스트)
// 게임 특화된 상태 변화(예: dead_user, send_result 등) 소켓 이벤트 처리
// CanvasService, GameStateService, GamePixelService 등과 연동하여
// 픽셀 상태, 유저 상태, 사망 처리 등 게임에 필요한 모든 상태 변화 관리

import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { CanvasService } from '../canvas/canvas.service';
import { GameStateService } from './game-state.service';
import { GamePixelService } from './game-pixel.service';
import Redis from 'ioredis';
import { Canvas } from '../canvas/entity/canvas.entity';
import { DataSource } from 'typeorm';

@Injectable()
export class GameLogicService {
  constructor(
    @Inject(forwardRef(() => CanvasService))
    private readonly canvasService: CanvasService,
    private readonly gameStateService: GameStateService,
    private readonly gamePixelService: GamePixelService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis, // Redis 인스턴스 주입
    private readonly dataSource: DataSource // DataSource 주입
  ) {}

  async handleSendResult(
    data: {
      canvas_id: string;
      x: number;
      y: number;
      color: string;
      result: boolean;
    },
    client: Socket,
    server: Server
  ) {
    // 유저 인증
    const userId = await this.getUserIdFromClient(client);

    if (!userId) {
      client.emit('auth_error', { message: '인증 필요' });
      return;
    }
    // 캔버스 종료 시간 체크 (색칠 차단)
    const canvasInfo = await this.canvasService.getCanvasById(data.canvas_id);
    const now = new Date();

    if (canvasInfo?.metaData?.type != 'game_calculation') {
      client.emit('game_error', {
        message: '게임 캔버스가 아닙니다. 다시 시도하세요',
      });
    }
    if (canvasInfo?.metaData?.endedAt && now > canvasInfo.metaData.endedAt) {
      console.warn(
        `[handleSendResult] 종료된 캔버스에 색칠 시도 차단: userId=${userId}, canvas_id=${data.canvas_id}`
      );
      client.emit('game_error', {
        message: '게임이 이미 종료되었습니다. 결과를 확인하세요.',
      });
      // 강제 게임 종료 트리거
      await this.forceGameEnd(data.canvas_id, server);
      return;
    }
    // 사망자 처리
    const isDead = await this.gameStateService.getUserDead(
      data.canvas_id,
      userId
    );
    if (isDead) {
      console.warn(
        `[handleSendResult] 사망자 색칠 시도: userId=${userId}, canvas_id=${data.canvas_id}, x=${data.x}, y=${data.y}`
      );
      client.emit('game_error', {
        message: '이미 사망한 유저입니다. 색칠이 불가합니다.',
      });
      return;
    }
    // 픽셀 정보 조회 (owner/color는 더이상 분기에서 사용하지 않음)
    const allPixels = await this.canvasService.getAllPixels(data.canvas_id);
    const found = allPixels.find((p) => p.x === data.x && p.y === data.y);
    const pixel = {
      owner: found?.owner ? String(found.owner) : null,
      color: found?.color || '#000000',
    };

    // result 값만으로 분기
    await this.gameStateService.incrUserTryCount(data.canvas_id, userId);
    if (data.result) {
      // 정답: 기존 owner own_count-1, 새로운 owner own_count+1, 색칠

      if (pixel.owner && pixel.owner !== userId) {
        await this.gameStateService.decrUserOwnCount(
          data.canvas_id,
          pixel.owner
        );
      }
      await this.gameStateService.incrUserOwnCount(data.canvas_id, userId);
      await this.canvasService.applyDrawPixel({
        canvas_id: data.canvas_id,
        x: data.x,
        y: data.y,
        color: data.color,
        userId: Number(userId),
      });
      // 픽셀 변경 시 updateQueue.add('pixel-update', {...})로 바로 큐에 추가
      server.to(`canvas_${data.canvas_id}`).emit('game_pixel_update', {
        x: data.x,
        y: data.y,
        color: data.color,
      });
      // 정답 처리 후에도 종료 시간 체크 및 강제 종료
      // const canvasInfoAfter = await this.canvasService.getCanvasById(
      //   data.canvas_id
      // );
      const nowAfter = new Date();
      if (
        canvasInfo?.metaData?.endedAt &&
        nowAfter > canvasInfo.metaData.endedAt
      ) {
        console.warn(
          `[handleSendResult] 정답 처리 후 종료 시간 만료 감지, forceGameEnd 호출: canvas_id=${data.canvas_id}`
        );
        await this.forceGameEnd(data.canvas_id, server);
      }
      return;
    } else {
      // 오답/타임오버: 라이프 차감
      const life = await this.gameStateService.decrUserLife(
        data.canvas_id,
        userId
      );

      if (life <= 0) {
        // 사망 처리: 픽셀 자유화, dead_user 브로드캐스트
        const freedPixels = await this.gamePixelService.freeAllPixelsOfUser(
          data.canvas_id,
          userId
        );
        await this.gameStateService.setUserDead(data.canvas_id, userId, true);
        await this.gameStateService.addDeadUser(data.canvas_id, userId);
        // own_count 0으로 강제 세팅
        await this.gameStateService.setUserOwnCount(data.canvas_id, userId, 0);
        server.to(`canvas_${data.canvas_id}`).emit('dead_user', {
          username: await this.getUserNameById(userId),
          pixels: freedPixels.map((p) => ({
            x: p.x,
            y: p.y,
            color: '#000000',
          })),
          count: freedPixels.length,
        });
        client.emit('dead_notice', { message: '사망하셨습니다.' });

        // --- 게임 종료 및 결과 브로드캐스트 ---
        // 모든 유저, 사망자 목록 조회
        const allUserIds = await this.gameStateService.getAllUsersInGame(
          data.canvas_id
        );
        const deadUserIds = await this.gameStateService.getAllDeadUsers(
          data.canvas_id
        );
        // 생존자 = 전체 - 사망자
        const aliveUserIds = allUserIds.filter(
          (uid) => !deadUserIds.includes(uid)
        );
        // 게임 종료 조건: 생존자가 없거나 게임 시간이 지났을 때
        const canvasInfo = await this.canvasService.getCanvasById(
          data.canvas_id
        );
        const now = new Date();
        const isGameTimeOver =
          canvasInfo?.metaData?.endedAt && now > canvasInfo.metaData.endedAt;

        // 남은 생존자가 없거나 게임 시간이 지났으면 게임 종료
        if (aliveUserIds.length === 0 || isGameTimeOver) {
          // 랭킹 계산 시간 측정 시작
          const rankingStart = Date.now();
          // 유저별 own_count, try_count, dead 여부 조회
          const userStats = await Promise.all(
            allUserIds.map(async (uid) => {
              const [own, tr, dead] = await Promise.all([
                this.gameStateService.getUserOwnCount(data.canvas_id, uid),
                this.gameStateService.getUserTryCount(data.canvas_id, uid),
                this.gameStateService.getUserDead(data.canvas_id, uid),
              ]);
              const username = await this.getUserNameById(uid); // 닉네임 조회
              return {
                username,
                own_count: own,
                try_count: tr,
                dead,
              };
            })
          );
          const ranked = this.calculateRanking(userStats);

          // 랭킹 계산 시간 측정 끝
          const rankingEnd = Date.now();

          // 게임 결과를 DB에 저장 (rank만 업데이트)
          await this.updateGameResultsByUserId(data.canvas_id, ranked);
          // 워커 큐에 canvas-history 잡 추가
          try {
            const { historyQueue } = await import('../queues/bullmq.queue');
            // 캔버스 정보 조회 (크기 등 필요시)
            const canvasInfo = await this.canvasService.getCanvasById(
              data.canvas_id
            );
            const meta = canvasInfo?.metaData;
            await historyQueue.add('canvas-history', {
              canvas_id: data.canvas_id,
              size_x: meta?.sizeX,
              size_y: meta?.sizeY,
              type: meta?.type,
              startedAt: meta?.startedAt,
              endedAt: meta?.endedAt,
              created_at: meta?.createdAt,
              updated_at: new Date(),
            });
          } catch (e) {
            console.error(
              `[GameLogicService] 워커 큐에 canvas-history 잡 추가 실패: canvasId=${data.canvas_id}`,
              e
            );
          }
          server
            .to(`canvas_${data.canvas_id}`)
            .emit('game_result', { results: ranked });
        }
        // ---
      }
      return;
    }
  }

  // 게임 시작 시 유저 초기화 (life=2, try_count=0, own_count=0, dead=false)
  async initializeUserForGame(canvasId: string, userId: string) {
    // 유저를 게임에 추가
    await this.gameStateService.addUserToGame(canvasId, userId);

    // 유저 상태 초기화
    await this.gameStateService.setUserLife(canvasId, userId, 2);
    await this.gameStateService.setUserDead(canvasId, userId, false);

    // flush 루프 시작 (한 번만 시작되도록)
    const flushKey = `flush_started:${canvasId}`;
    const isFlushStarted = await this.redis.get(flushKey);
    if (!isFlushStarted) {
      // await this.gameFlushService.flushLoop(canvasId);
      await this.redis.setex(flushKey, 3600, '1'); // 1시간 동안 유지
    }
  }

  // 유저 id 추출 (canvas.gateway와 동일하게 구현)
  private async getUserIdFromClient(client: Socket): Promise<string | null> {
    try {
      const sessionKey = `socket:${client.id}:user`;
      const userData = await this.redis.get(sessionKey); // Redis에서 직접 조회
      if (!userData) return null;
      const user = JSON.parse(userData);
      const userId = String(user.id ?? user.userId);

      // 사용자 ID 유효성 검증
      if (!userId || userId === '0') {
        console.warn(
          `[GameLogicService] 유효하지 않은 사용자 ID 감지: userId=${userId}, socketId=${client.id}`
        );
        return null;
      }

      return userId;
    } catch {
      return null;
    }
  }

  // 유저 이름 조회 (anvas.gateway.ts와 동일하게)
  private async getUserNameById(userId: string): Promise<string> {
    try {
      // Redis에 저장된 모든 소켓 id를 가져와서 username을 찾는다
      const keys = await this.redis.keys('socket:*:user');
      for (const key of keys) {
        const userData = await this.redis.get(key);
        if (!userData) continue;
        const user = JSON.parse(userData);
        if (String(user.id ?? user.userId) === String(userId)) {
          return user.username || String(userId);
        }
      }
      return String(userId);
    } catch {
      return String(userId);
    }
  }

  // 유저 id를 이름으로 찾는 메서드 (Redis에서 사용)
  private async getUserIdById(username: string): Promise<string | null> {
    try {
      // Redis에 저장된 모든 소켓 id를 가져와서 userId를 찾는다
      const keys = await this.redis.keys('socket:*:user');
      for (const key of keys) {
        const userData = await this.redis.get(key);
        if (!userData) continue;
        const user = JSON.parse(userData);
        if (user.username === username) {
          return String(user.id ?? user.userId);
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  // 캔버스 종료(시간 만료) 시 강제 게임 종료 및 결과 브로드캐스트
  async forceGameEnd(canvasId: string, server?: any) {
    try {
      // dirty set 구조 제거로 인해 별도 flush 불필요, 바로 다음 로직 실행
      // 랭킹 계산 시간 측정 시작
      const rankingStart = Date.now();
      // 모든 유저, 사망자 목록 조회
      const allUserIds =
        await this.gameStateService.getAllUsersInGame(canvasId);
      const deadUserIds = await this.gameStateService.getAllDeadUsers(canvasId);
      const aliveUserIds = allUserIds.filter(
        (uid) => !deadUserIds.includes(uid)
      );
      // 유저별 own_count, try_count, dead 여부 조회
      const userStats = await Promise.all(
        allUserIds.map(async (uid) => {
          const [own, tr, dead] = await Promise.all([
            this.gameStateService.getUserOwnCount(canvasId, uid),
            this.gameStateService.getUserTryCount(canvasId, uid),
            this.gameStateService.getUserDead(canvasId, uid),
          ]);
          const username = await this.getUserNameById(uid); // 닉네임 조회
          return {
            username,
            own_count: own,
            try_count: tr,
            dead,
            userId: uid,
          };
        })
      );
      // 랭킹 산정
      const ranked = this.calculateRanking(userStats);
      // 랭킹 계산 시간 측정 끝
      const rankingEnd = Date.now();
      // 게임 결과를 DB에 저장 (rank만 업데이트, userId 직접 사용)
      await this.updateGameResultsByUserId(canvasId, ranked);
      // 게임 종료 시점에 user_canvas 테이블에 유저별 통계 upsert
      for (const user of userStats) {
        try {
          await this.dataSource.query(
            `INSERT INTO user_canvas (user_id, canvas_id, own_count, try_count, joined_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (user_id, canvas_id)
             DO UPDATE SET own_count = $3, try_count = $4`,
            [user.userId, canvasId, user.own_count || 0, user.try_count || 0]
          );
        } catch (err) {
          console.error(
            '[forceGameEnd] user_canvas upsert 실패:',
            user.userId,
            err
          );
        }
      }
      // 게임 종료 시 canvas-history 잡 추가 (히스토리 워커)
      try {
        const { historyQueue } = await import('../queues/bullmq.queue');
        // 캔버스 정보 조회 (크기 등 필요시)
        const canvasInfo = await this.canvasService.getCanvasById(canvasId);
        const meta = canvasInfo?.metaData;
        await historyQueue.add(
          'canvas-history',
          {
            canvas_id: canvasId,
            size_x: Number(meta?.sizeX),
            size_y: Number(meta?.sizeY),
            type: meta?.type,
            startedAt: meta?.startedAt,
            endedAt: meta?.endedAt,
            created_at: meta?.createdAt,
            updated_at: new Date(),
          },
          { jobId: `history-${canvasId}`, delay: 5000 }
        );
      } catch (e) {
        console.error(
          `[GameLogicService] forceGameEnd: 워커 큐에 canvas-history 잡 추가 실패: canvasId=${canvasId}`,
          e
        );
      }
      // 결과 브로드캐스트
      if (server) {
        server
          .to(`canvas_${canvasId}`)
          .emit('game_result', { results: ranked });
      }
    } catch (err) {
      console.error(
        `[GameLogicService] forceGameEnd 에러: canvasId=${canvasId}`,
        err
      );
    }
  }

  // 게임 결과를 DB에 저장 (rank만 업데이트, userId 직접 사용)
  private async updateGameResultsByUserId(canvasId: string, results: any[]) {
    try {
      // 배치 업데이트를 위한 쿼리 준비
      const updatePromises = results.map(async (result) => {
        const userId = result.userId;
        if (!userId) {
          console.warn(`[GameLogicService] userId 없음: result=`, result);
          return;
        }
        // game_user_result 테이블에 rank 업데이트
        await this.dataSource.query(
          `UPDATE game_user_result SET rank = $1 WHERE user_id = $2 AND canvas_id = $3`,
          [result.rank, userId, canvasId]
        );
      });
      await Promise.all(updatePromises);
    } catch (error) {
      console.error(`[GameLogicService] 랭킹 업데이트 실패:`, error);
    }
  }

  // 랭킹 산정(정렬) 로직 분리
  private calculateRanking(userStats: any[]): any[] {
    return userStats
      .map((u) => ({ ...u }))
      .sort((a, b) => {
        // 소유수 내림차순
        if (b.own_count !== a.own_count) return b.own_count - a.own_count;
        // 시도수 내림차순
        if (b.try_count !== a.try_count) return b.try_count - a.try_count;
        // userId 오름차순 (숫자 비교)
        const aId =
          typeof a.userId === 'number' ? a.userId : parseInt(a.userId, 10);
        const bId =
          typeof b.userId === 'number' ? b.userId : parseInt(b.userId, 10);
        return aId - bId;
      })
      .map((u, i) => ({ ...u, rank: i + 1 }));
  }
}
