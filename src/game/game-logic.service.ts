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
import { GameFlushService } from './game-flush.service';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';

@Injectable()
export class GameLogicService {
  constructor(
    @Inject(forwardRef(() => CanvasService))
    private readonly canvasService: CanvasService,
    private readonly gameStateService: GameStateService,
    private readonly gamePixelService: GamePixelService,
    private readonly gameFlushService: GameFlushService,
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
    console.log(`[handleSendResult] 호출: userId=${userId}, data=`, data);
    if (!userId) {
      client.emit('auth_error', { message: '인증 필요' });
      return;
    }
    // 캔버스 종료 시간 체크 (색칠 차단)
    const canvasInfo = await this.canvasService.getCanvasById(data.canvas_id);
    const now = new Date();
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

    // game_user_result 보장 (없으면 생성)
    await this.insertUserToGameResult(data.canvas_id, userId);

    // result 값만으로 분기
    await this.gameStateService.incrUserTryCount(data.canvas_id, userId);
    if (data.result) {
      // 정답: 기존 owner own_count-1, 새로운 owner own_count+1, 색칠
      console.log('[handleSendResult] 정답 처리: applyDrawPixel 호출 전', {
        canvas_id: data.canvas_id,
        x: data.x,
        y: data.y,
        color: data.color,
        userId,
      });
      if (pixel.owner && pixel.owner !== userId) {
        await this.gameStateService.decrUserOwnCount(
          data.canvas_id,
          pixel.owner
        );
        await this.gameFlushService.addDirtyUser(data.canvas_id, pixel.owner);
      }
      await this.gameStateService.incrUserOwnCount(data.canvas_id, userId);
      await this.gameFlushService.addDirtyUser(data.canvas_id, userId);
      await this.canvasService.applyDrawPixel({
        canvas_id: data.canvas_id,
        x: data.x,
        y: data.y,
        color: data.color,
        userId: Number(userId),
      });
      server.to(`canvas_${data.canvas_id}`).emit('pixel_update', {
        x: data.x,
        y: data.y,
        color: data.color,
      });
      // 정답 처리 후에도 종료 시간 체크 및 강제 종료
      const canvasInfoAfter = await this.canvasService.getCanvasById(
        data.canvas_id
      );
      const nowAfter = new Date();
      if (
        canvasInfoAfter?.metaData?.endedAt &&
        nowAfter > canvasInfoAfter.metaData.endedAt
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
      await this.gameFlushService.addDirtyUser(data.canvas_id, userId);
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
        await this.gameFlushService.addDirtyUser(data.canvas_id, userId);
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
        console.log(
          `[GameLogicService] 게임 종료 조건 체크: canvasId=${data.canvas_id}, 생존자=${aliveUserIds.length}명, 게임시간종료=${isGameTimeOver}`
        );
        // 남은 생존자가 없거나 게임 시간이 지났으면 게임 종료
        if (aliveUserIds.length === 0 || isGameTimeOver) {
          console.log(
            `[GameLogicService] 게임 종료 조건 만족: 생존자=${aliveUserIds.length}명, 시간종료=${isGameTimeOver}`
          );
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
          // 랭킹 산정
          console.log(
            `[GameLogicService] 게임 종료 - 랭킹 계산 시작: canvasId=${data.canvas_id}, 전체 유저=${allUserIds.length}, 사망자=${deadUserIds.length}, 생존자=${aliveUserIds.length}`
          );
          const ranked = this.calculateRanking(userStats);
          console.log(
            `[GameLogicService] 랭킹 계산 완료:`,
            ranked.map(
              (r) =>
                `${r.username}(rank=${r.rank}, own=${r.own_count}, try=${r.try_count}, dead=${r.dead})`
            )
          );
          // 랭킹 계산 시간 측정 끝
          const rankingEnd = Date.now();
          console.log(
            `[GameLogicService] 랭킹 계산 및 결과 브로드캐스트 준비까지 소요: ${rankingEnd - rankingStart}ms`
          );
          // 게임 결과를 DB에 저장 (rank만 업데이트)
          await this.updateGameResults(data.canvas_id, ranked);
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
            console.log(
              `[GameLogicService] 워커 큐에 canvas-history 잡 추가 완료: canvasId=${data.canvas_id}`
            );
          } catch (e) {
            console.error(
              `[GameLogicService] 워커 큐에 canvas-history 잡 추가 실패: canvasId=${data.canvas_id}`,
              e
            );
          }
          server
            .to(`canvas_${data.canvas_id}`)
            .emit('game_result', { results: ranked });
          console.log(
            `[GameLogicService] 게임 결과 브로드캐스트 완료: canvasId=${data.canvas_id}`
          );
        }
        // ---
      }
      return;
    }
  }

  // 게임 시작 시 유저 초기화 (life=2, try_count=0, own_count=0, dead=false)
  async initializeUserForGame(canvasId: string, userId: string) {
    console.log(
      `[GameLogicService] 유저 초기화: canvasId=${canvasId}, userId=${userId}`
    );

    // 유저를 게임에 추가
    await this.gameStateService.addUserToGame(canvasId, userId);

    // 유저 상태 초기화
    await this.gameStateService.setUserLife(canvasId, userId, 2);
    await this.gameStateService.setUserDead(canvasId, userId, false);

    // try_count, own_count는 0으로 시작 (이미 기본값)
    console.log(
      `[GameLogicService] 유저 초기화 완료: userId=${userId}, life=2`
    );

    // game_user_result 테이블에 유저 정보 삽입
    await this.insertUserToGameResult(canvasId, userId);

    // flush 루프 시작 (한 번만 시작되도록)
    const flushKey = `flush_started:${canvasId}`;
    const isFlushStarted = await this.redis.get(flushKey);
    if (!isFlushStarted) {
      await this.gameFlushService.flushLoop(canvasId);
      await this.redis.setex(flushKey, 3600, '1'); // 1시간 동안 유지
      console.log(`[GameLogicService] flush 루프 시작: canvasId=${canvasId}`);
    }
  }

  // game_user_result 테이블에 유저 정보 삽입
  private async insertUserToGameResult(canvasId: string, userId: string) {
    try {
      const username = await this.getUserNameById(userId);
      let color = await this.gameStateService.getUserColor(canvasId, userId);
      // 색이 없으면 기본 색 생성
      if (!color) {
        const { generatorColor } = await import('../util/colorGenerator.util');
        color = generatorColor();
        await this.gameStateService.setUserColor(canvasId, userId, color);
        console.log(
          `[GameLogicService] 기본 색 생성 및 저장: userId=${userId}, color=${color}`
        );
      }
      await this.dataSource.query(
        `INSERT INTO game_user_result (user_id, canvas_id, assigned_color, life, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [userId, canvasId, color, 2]
      );
      console.log(
        `[GameLogicService] game_user_result 삽입 완료: userId=${userId}, username=${username}, color=${color}`
      );
    } catch (error) {
      console.error(
        `[GameLogicService] game_user_result 삽입 실패: userId=${userId}, canvasId=${canvasId}, 에러:`,
        error
      );
    }
  }

  // 유저 id 추출 (canvas.gateway와 동일하게 구현)
  private async getUserIdFromClient(client: Socket): Promise<string | null> {
    try {
      const sessionKey = `socket:${client.id}:user`;
      const userData = await this.redis.get(sessionKey); // Redis에서 직접 조회
      if (!userData) return null;
      const user = JSON.parse(userData);
      return String(user.id ?? user.userId);
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

  // 게임 결과를 DB에 저장 (rank만 업데이트)
  private async updateGameResults(canvasId: string, results: any[]) {
    try {
      console.log(
        `[GameLogicService] DB에 랭킹 업데이트 시작: canvasId=${canvasId}, 결과 수=${results.length}`
      );

      // 모든 유저의 userId를 한 번에 조회
      const allUserIds =
        await this.gameStateService.getAllUsersInGame(canvasId);
      const usernameToUserIdMap = new Map<string, string>();

      // username -> userId 매핑 생성
      for (const userId of allUserIds) {
        const username = await this.getUserNameById(userId);
        usernameToUserIdMap.set(username, userId);
      }

      // 배치 업데이트를 위한 쿼리 준비
      const updatePromises = results.map(async (result) => {
        const userId = usernameToUserIdMap.get(result.username);
        if (!userId) {
          console.warn(
            `[GameLogicService] userId를 찾을 수 없음: username=${result.username}`
          );
          return;
        }

        // game_user_result 테이블에 rank 업데이트
        await this.dataSource.query(
          `UPDATE game_user_result SET rank = $1 WHERE user_id = $2 AND canvas_id = $3`,
          [result.rank, userId, canvasId]
        );

        console.log(
          `[GameLogicService] 랭킹 업데이트 완료: userId=${userId}, username=${result.username}, rank=${result.rank}`
        );
      });

      // 모든 업데이트를 병렬로 실행
      await Promise.all(updatePromises);

      console.log(
        `[GameLogicService] 모든 랭킹 업데이트 완료: canvasId=${canvasId}`
      );
    } catch (error) {
      console.error(`[GameLogicService] 랭킹 업데이트 실패:`, error);
    }
  }

  // canvas_history 생성
  private async createCanvasHistory(canvasId: string) {
    try {
      console.log(
        `[GameLogicService] canvas_history 생성 시작: canvasId=${canvasId}`
      );

      // 기존 canvas_history가 있는지 확인
      const existingHistory = await this.dataSource.query(
        'SELECT id FROM canvas_history WHERE canvas_id = $1',
        [canvasId]
      );

      if (existingHistory.length > 0) {
        console.log(
          `[GameLogicService] canvas_history 이미 존재: canvasId=${canvasId}`
        );
        return;
      }

      // canvas_history 생성
      await this.dataSource.query(
        `INSERT INTO canvas_history (canvas_id, created_at)
         VALUES ($1, NOW())`,
        [canvasId]
      );

      console.log(
        `[GameLogicService] canvas_history 생성 완료: canvasId=${canvasId}`
      );
    } catch (error) {
      console.error(
        `[GameLogicService] canvas_history 생성 실패: canvasId=${canvasId}`,
        error
      );
    }
  }

  // 캔버스 종료(시간 만료) 시 강제 게임 종료 및 결과 브로드캐스트
  async forceGameEnd(canvasId: string, server?: any) {
    try {
      console.log(`[GameLogicService] forceGameEnd 호출: canvasId=${canvasId}`);
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
          };
        })
      );
      // 랭킹 산정
      const ranked = this.calculateRanking(userStats);
      console.log(
        `[GameLogicService] forceGameEnd 랭킹 계산 완료:`,
        ranked.map(
          (r) =>
            `${r.username}(rank=${r.rank}, own=${r.own_count}, try=${r.try_count}, dead=${r.dead})`
        )
      );
      // 랭킹 계산 시간 측정 끝
      const rankingEnd = Date.now();
      console.log(
        `[GameLogicService] forceGameEnd 랭킹 계산 및 결과 브로드캐스트 준비까지 소요: ${rankingEnd - rankingStart}ms`
      );
      // 게임 결과를 DB에 저장 (rank만 업데이트)
      await this.updateGameResults(canvasId, ranked);
      // 워커 큐에 canvas-history 잡 추가
      try {
        const { historyQueue } = await import('../queues/bullmq.queue');
        const canvasInfo = await this.canvasService.getCanvasById(canvasId);
        const meta = canvasInfo?.metaData;
        await historyQueue.add('canvas-history', {
          canvas_id: canvasId,
          size_x: meta?.sizeX,
          size_y: meta?.sizeY,
          type: meta?.type,
          startedAt: meta?.startedAt,
          endedAt: meta?.endedAt,
          created_at: meta?.createdAt,
          updated_at: new Date(),
        });
        console.log(
          `[GameLogicService] 워커 큐에 canvas-history 잡 추가 완료: canvasId=${canvasId}`
        );
      } catch (e) {
        console.error(
          `[GameLogicService] 워커 큐에 canvas-history 잡 추가 실패: canvasId=${canvasId}`,
          e
        );
      }
      // 결과 브로드캐스트
      if (server) {
        server
          .to(`canvas_${canvasId}`)
          .emit('game_result', { results: ranked });
        console.log(
          `[GameLogicService] forceGameEnd 결과 브로드캐스트 완료: canvasId=${canvasId}`
        );
      }
    } catch (err) {
      console.error(
        `[GameLogicService] forceGameEnd 에러: canvasId=${canvasId}`,
        err
      );
    }
  }

  // 랭킹 산정(정렬) 로직 분리
  private calculateRanking(userStats: any[]): any[] {
    return userStats
      .map((u) => ({ ...u }))
      .sort((a, b) => {
        if (!a.dead && a.try_count > 0 && (b.dead || b.try_count === 0))
          return -1;
        if (!b.dead && b.try_count > 0 && (a.dead || a.try_count === 0))
          return 1;
        if (!a.dead && !b.dead && a.try_count > 0 && b.try_count > 0) {
          if (b.own_count !== a.own_count) return b.own_count - a.own_count;
          return a.try_count - b.try_count;
        }
        if ((a.dead || a.try_count === 0) && (b.dead || b.try_count === 0)) {
          if (b.try_count !== a.try_count) return b.try_count - a.try_count;
          return a.own_count - b.own_count;
        }
        return 0;
      })
      .map((u, i) => ({ ...u, rank: i + 1 }));
  }
}
