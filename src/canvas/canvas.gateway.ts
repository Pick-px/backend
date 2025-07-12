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

interface SocketUser {
  userId?: number;
  id?: number;
  [key: string]: any;
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
    private readonly redis: Redis
  ) {}

  afterInit(server: Server) {
    console.log('[CanvasGateway] afterInit 메서드 호출됨');
    
    // AppGateway 초기화 완료 대기
    setTimeout(() => {
      this.initializeRedisAdapter(server);
    }, 1000); // 1초 대기
  }

  private initializeRedisAdapter(server: Server) {
    // Redis Adapter 설정 (멀티서버 환경 최적화)
    const pubClient = this.redis;
    const subClient = this.redis.duplicate();
    
    console.log('[CanvasGateway] Redis 상태 확인 중...', pubClient.status);
    console.log('[CanvasGateway] Redis 객체 타입:', typeof pubClient);
    console.log('[CanvasGateway] Redis 연결 상태:', pubClient.status);
    
    // Redis Adapter 설정 전 연결 상태 확인
    if (pubClient.status === 'ready') {
      console.log('[CanvasGateway] Redis 연결 준비됨, Adapter 설정 시작');
      this.setupRedisAdapter(server, pubClient, subClient);
    } else {
      console.log('[CanvasGateway] Redis 연결 대기 중... 현재 상태:', pubClient.status);
      pubClient.on('ready', () => {
        console.log('[CanvasGateway] Redis 연결 준비됨, Adapter 설정 시작');
        this.setupRedisAdapter(server, pubClient, subClient);
      });
      
      // 연결 실패 시 대비
      pubClient.on('error', (error) => {
        console.error('[CanvasGateway] Redis 연결 에러:', error);
      });
    }
  }

  private setupRedisAdapter(server: Server, pubClient: Redis, subClient: Redis) {
    server.adapter(createAdapter(pubClient, subClient));
    console.log('[CanvasGateway] Redis Adapter 설정 완료');
  }

  // Redis 세션에서 사용자 정보 가져오기
  private async getUserIdFromClient(client: Socket): Promise<number | null> {
    try {
      const sessionKey = `socket:${client.id}:user`;
      const userData = await this.redis.get(sessionKey);
      
      if (!userData) return null;
      
      const user = JSON.parse(userData) as SocketUser;
      return Number(user.userId || user.id);
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
        console.log(
          `[소켓] 사용자 ${userId}의 픽셀 그리기 실패: ${result.message}`
        );
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
        })
      );

      // 비동기 브로드캐스트 (응답 속도 향상)
      setImmediate(() => {
        this.server.to(`canvas_${pixel.canvas_id}`).emit('pixel_update', {
          x: pixel.x,
          y: pixel.y,
          color: pixel.color,
        });
      });

      console.log(
        `[Gateway] 픽셀 그리기 완료: canvas=${pixel.canvas_id}, 위치=(${pixel.x},${pixel.y}), 색상=${pixel.color}`
      );
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
    
    console.log(`[CanvasGateway] 소켓 ${client.id}가 캔버스 ${canvasId}에 참여함 (로그인: ${userId ? '예' : '아니오'})`);
    
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
        console.log(error);
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
        console.log(
          `[소켓] 사용자 ${userId}의 픽셀 그리기 실패: ${result.message}`
        );
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
        })
      );

      // 비동기 브로드캐스트 (응답 속도 향상)
      setImmediate(() => {
        this.server.to(`canvas_${pixel.canvas_id}`).emit('pixel_update', {
          x: pixel.x,
          y: pixel.y,
          color: pixel.color,
        });
      });

      console.log(
        `[Gateway] 픽셀 그리기 완료: canvas=${pixel.canvas_id}, 위치=(${pixel.x},${pixel.y}), 색상=${pixel.color}`
      );
    } catch (error) {
      console.error('[Gateway] 픽셀 그리기 에러:', error);
    }
  }
}
