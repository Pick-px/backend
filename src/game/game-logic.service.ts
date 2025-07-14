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

@Injectable()
export class GameLogicService {
  constructor(
    @Inject(forwardRef(() => CanvasService)) private readonly canvasService: CanvasService,
    private readonly gameStateService: GameStateService,
    private readonly gamePixelService: GamePixelService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis, // Redis 인스턴스 주입
  ) {}

  async handleSendResult(
    data: { canvas_id: string; x: number; y: number; color: string; result: boolean },
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
    // 사망자 처리
    const isDead = await this.gameStateService.getUserDead(data.canvas_id, userId);
    if (isDead) {
      console.warn(`[handleSendResult] 사망자 색칠 시도: userId=${userId}, canvas_id=${data.canvas_id}, x=${data.x}, y=${data.y}`);
      client.emit('game_error', { message: '이미 사망한 유저입니다. 색칠이 불가합니다.' });
      return;
    }
    // 픽셀 정보 조회 (owner/color는 더이상 분기에서 사용하지 않음)
    const allPixels = await this.canvasService.getAllPixels(data.canvas_id);
    const found = allPixels.find(p => p.x === data.x && p.y === data.y);
    const pixel = { owner: found?.owner ? String(found.owner) : null, color: found?.color || '#000000' };

    // result 값만으로 분기
    await this.gameStateService.incrUserTryCount(data.canvas_id, userId);
    if (data.result) {
      // 정답: 기존 owner own_count-1, 새로운 owner own_count+1, 색칠
      console.log('[handleSendResult] 정답 처리: applyDrawPixel 호출 전', { canvas_id: data.canvas_id, x: data.x, y: data.y, color: data.color, userId });
      if (pixel.owner && pixel.owner !== userId) {
        await this.gameStateService.decrUserOwnCount(data.canvas_id, pixel.owner);
      }
      await this.gameStateService.incrUserOwnCount(data.canvas_id, userId);
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
      return;
    } else {
      // 오답/타임오버: 라이프 차감
      const life = await this.gameStateService.decrUserLife(data.canvas_id, userId);
      if (life <= 0) {
        // 사망 처리: 픽셀 자유화, dead_user 브로드캐스트
        const freedPixels = await this.gamePixelService.freeAllPixelsOfUser(data.canvas_id, userId);
        await this.gameStateService.setUserDead(data.canvas_id, userId, true);
        await this.gameStateService.addDeadUser(data.canvas_id, userId);
        server.to(`canvas_${data.canvas_id}`).emit('dead_user', {
          username: await this.getUserNameById(userId),
          pixels: freedPixels.map(p => ({ x: p.x, y: p.y, color: '#000000' })),
          count: freedPixels.length,
        });
        client.emit('dead_notice', { message: '사망하셨습니다.' });

        // --- 게임 종료 및 결과 브로드캐스트 ---
        // 모든 유저, 사망자 목록 조회
        const allUserIds = await this.gameStateService.getAllUsersInGame(data.canvas_id);
        const deadUserIds = await this.gameStateService.getAllDeadUsers(data.canvas_id);
        // 생존자 = 전체 - 사망자
        const aliveUserIds = allUserIds.filter(uid => !deadUserIds.includes(uid));
        // 남은 생존자가 없으면 게임 종료
        if (aliveUserIds.length === 0) {
          // 유저별 own_count, try_count, dead 여부 조회
          const userStats = await Promise.all(
            allUserIds.map(async uid => {
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
          const ranked = userStats
            .map(u => ({ ...u }))
            .sort((a, b) => {
              // 생존+try_count>0 우선
              if (!a.dead && a.try_count > 0 && (b.dead || b.try_count === 0)) return -1;
              if (!b.dead && b.try_count > 0 && (a.dead || a.try_count === 0)) return 1;
              // 둘 다 생존+try_count>0
              if (!a.dead && !b.dead && a.try_count > 0 && b.try_count > 0) {
                if (b.own_count !== a.own_count) return b.own_count - a.own_count;
                return a.try_count - b.try_count;
              }
              // 둘 다 사망 or try_count==0
              if ((a.dead || a.try_count === 0) && (b.dead || b.try_count === 0)) {
                if (b.try_count !== a.try_count) return b.try_count - a.try_count;
                return a.own_count - b.own_count;
              }
              return 0;
            })
            .map((u, i) => ({ ...u, rank: i + 1 }));
          server.to(`canvas_${data.canvas_id}`).emit('game_result', { results: ranked });
        }
        // ---
      }
      return;
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
} 