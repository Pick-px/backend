import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { CanvasService } from './canvas.service';
import Redis from 'ioredis';
import { Inject } from '@nestjs/common';
import { DrawPixelResponse } from '../interface/DrawPixelResponse.interface';
import { createAdapter } from '@socket.io/redis-adapter';
import { setSocketServer } from '../socket/socket.manager';
import { GameLogicService } from '../game/game-logic.service';
import { GameStateService } from '../game/game-state.service';
import { BroadcastService } from './broadcast.service';

interface SocketUser {
  id: number;
  username?: string;
}

@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:5173',
      'https://ws.pick-px.com',
      'https://pick-px.com',
    ],
    credentials: true,
  },
})
export class CanvasGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly canvasService: CanvasService,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
    private readonly gameLogicService: GameLogicService, // 게임 특화 로직 주입
    private readonly gameStateService: GameStateService, // 게임 상태 관리 주입
    private readonly broadcastService: BroadcastService // 브로드캐스트 서비스 주입
  ) {}

  afterInit(server: Server) {
    setSocketServer(this.server);
    // AppGateway 초기화 완료 대기
    setTimeout(() => {
      this.initializeRedisAdapter(server);
    }, 1000); // 1초 대기
  }

  private initializeRedisAdapter(server: Server) {
    // Redis Adapter 설정 (멀티서버 환경 최적화)
    const pubClient = this.redis;
    const subClient = this.redis.duplicate();

    // Redis Adapter 설정 전 연결 상태 확인
    if (pubClient.status === 'ready') {
      this.setupRedisAdapter(server, pubClient, subClient);
    } else {
      pubClient.on('ready', () => {
        this.setupRedisAdapter(server, pubClient, subClient);
      });

      // 연결 실패 시 대비
      pubClient.on('error', (error) => {});
    }
  }

  private setupRedisAdapter(
    server: Server,
    pubClient: Redis,
    subClient: Redis
  ) {
    server.adapter(createAdapter(pubClient, subClient));
  }

  // Redis 세션에서 사용자 id만 가져오기 (owner 용)
  private async getUserIdFromClient(client: Socket): Promise<number | null> {
    try {
      const sessionKey = `socket:${client.id}:user`;
      const userData = await this.redis.get(sessionKey);
      if (!userData) return null;
      const user = JSON.parse(userData) as SocketUser;
      const userId = typeof user.id === 'number' ? user.id : Number(user.id);

      // 사용자 ID 유효성 검증
      if (!userId || userId <= 0) {
        console.warn(
          `[CanvasGateway] 유효하지 않은 사용자 ID 감지: userId=${userId}, socketId=${client.id}`
        );
        return null;
      }

      return userId;
    } catch (error) {
      console.error('[CanvasGateway] 사용자 세션 조회 중 에러:', error);
      return null;
    }
  }

  // Redis 세션에서 전체 유저 정보 가져오기 (username 등 활용 가능)
  private async getUserInfoFromClient(
    client: Socket
  ): Promise<SocketUser | null> {
    try {
      const sessionKey = `socket:${client.id}:user`;
      const userData = await this.redis.get(sessionKey);
      if (!userData) return null;
      return JSON.parse(userData) as SocketUser;
    } catch (error) {
      console.error('[CanvasGateway] 사용자 세션 조회 중 에러:', error);
      return null;
    }
  }

  // 픽셀 그리기 요청
  @SubscribeMessage('draw_pixel')
  async handleDrawPixel(
    @MessageBody()
    pixel: { canvas_id: string; x: number; y: number; color: string },
    @ConnectedSocket() client: Socket
  ) {
    const userId = await this.getUserIdFromClient(client);
    if (!userId) {
      client.emit('auth_error', { message: '인증 필요' });
      return;
    }
    try {
      const result: DrawPixelResponse =
        await this.canvasService.applyDrawPixelWithCooldown({
          ...pixel,
          userId,
        });
      if (!result.success) {
        client.emit('pixel_error', {
          message: result.message,
        });
        return;
      }

      // 워커로 픽셀 이벤트 발행 (DB 저장을 위해)
      await this.redis.publish(
        'pixel:updated',
        JSON.stringify({
          canvasId: Number(pixel.canvas_id),
          x: pixel.x,
          y: pixel.y,
          color: pixel.color,
          owner: userId,
        })
      );

      console.log('픽셀 그리기 성공:', pixel);

      // 비동기 브로드캐스트 (응답 속도 향상)
      this.server.to(`canvas_${pixel.canvas_id}`).emit('pixel_update', {
        pixels: [
          {
            x: pixel.x,
            y: pixel.y,
            color: pixel.color,
          },
        ],
      });
      // this.broadcastService.addPixelToBatch({
      //   canvas_id: pixel.canvas_id,
      //   x: pixel.x,
      //   y: pixel.y,
      //   color: pixel.color,
      // });
    } catch (error) {
      console.error('[Gateway] 픽셀 그리기 에러:', error);
      client.emit('pixel_error', { message: '픽셀 그리기 실패' });
    }
  }

  @SubscribeMessage('join_canvas')
  async handleJoinCanvas(
    @MessageBody() data: { canvas_id: string },
    @ConnectedSocket() client: Socket
  ) {
    const userId = await this.getUserIdFromClient(client);
    const canvasId = Number(data.canvas_id);

    await client.join(`canvas_${data.canvas_id}`);

    // 캔버스별 소켓ID 관리 (AppGateway에서 접속자 수 계산에 사용)
    const canvasSocketKey = `canvas:${canvasId}:sockets`;
    await this.redis.sadd(canvasSocketKey, client.id);
    await this.redis.expire(canvasSocketKey, 600); // 10분 TTL

    // 게임 캔버스인 경우 유저 초기화 및 색 배정
    const canvasType = await this.canvasService.getCanvasType(data.canvas_id);
    if (canvasType === 'game_calculation') {
      // 게임 캔버스는 접속 시부터 로그인 필수
      if (!userId) {
        client.emit('auth_error', {
          message: '게임 모드는 로그인 후 접속 가능합니다.',
        });
        return;
      }

      // 캔버스 종료 상태 체크
      const canvasInfo = await this.canvasService.getCanvasById(data.canvas_id);
      const now = new Date();
      if (canvasInfo?.metaData?.endedAt && now > canvasInfo.metaData.endedAt) {
        // 이미 종료된 캔버스라면 결과 브로드캐스트 트리거
        await this.gameLogicService.forceGameEnd(data.canvas_id, this.server);
        client.emit('game_error', {
          message: '게임이 이미 종료되었습니다. 결과를 확인하세요.',
        });
        return;
      }
      // 게임 캔버스: 유저 상태 초기화 (life=2, try_count=0, own_count=0, dead=false)
      await this.gameLogicService.initializeUserForGame(
        data.canvas_id,
        String(userId)
      );

      // 색 배정은 GameService.setGameReady()에서 처리하므로 여기서는 제거
    }

    // 쿨다운 정보 자동 푸시
    if (userId && data.canvas_id) {
      try {
        const remaining = await this.canvasService.getCooldownRemaining(
          userId,
          data.canvas_id
        );
        client.emit('cooldown_info', { cooldown: remaining > 0, remaining });
      } catch (error) {
        // 쿨다운 정보 조회 실패 시 무시
        console.error(error);
      }
    }
  }

  // 픽셀 그리기 요청
  @SubscribeMessage('draw_pixel_simul')
  async handleDrawPixelForSimulator(
    @MessageBody()
    pixel: {
      canvas_id: string;
      x: number;
      y: number;
      color: string;
      user_id: number;
    },
    @ConnectedSocket() client: Socket
  ) {
    try {
      const userId = pixel.user_id;
      const result: DrawPixelResponse =
        await this.canvasService.applyDrawPixelForSimulation({
          ...pixel,
          userId,
        });
      if (!result.success) {
        return;
      }

      // 워커로 픽셀 이벤트 발행 (DB 저장을 위해)
      await this.redis.publish(
        'pixel:updated',
        JSON.stringify({
          canvasId: Number(pixel.canvas_id),
          x: pixel.x,
          y: pixel.y,
          color: pixel.color,
          owner: userId,
        })
      );

      // 비동기 브로드캐스트 (응답 속도 향상)
      // setImmediate(() => {
      //   this.server.to(`canvas_${pixel.canvas_id}`).emit('pixel_update', {
      //     x: pixel.x,
      //     y: pixel.y,
      //     color: pixel.color,
      //   });
      // });

      this.broadcastService.addPixelToBatch({
        canvas_id: pixel.canvas_id,
        x: pixel.x,
        y: pixel.y,
        color: pixel.color,
      });
    } catch (error) {
      console.error('[Gateway] 픽셀 그리기 에러:', error);
    }
  }

  @SubscribeMessage('send_result')
  async handleSendResult(
    @MessageBody()
    data: {
      canvas_id: string;
      x: number;
      y: number;
      color: string;
      result: boolean;
    },
    @ConnectedSocket() client: Socket
  ) {
    const canvasType = await this.canvasService.getCanvasType(data.canvas_id);

    if (canvasType === 'game_calculation') {
      await this.gameLogicService.handleSendResult(data, client, this.server);
      return;
    }
    // (일반/이벤트 캔버스에서는 무시)
  }
}
