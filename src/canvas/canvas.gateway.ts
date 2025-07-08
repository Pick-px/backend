import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { CanvasService } from './canvas.service';
import Redis from 'ioredis';
import { Inject } from '@nestjs/common';
import { DrawPixelResponse } from '../interface/DrawPixelResponse.interface';

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
export class CanvasGateway {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly canvasService: CanvasService,
    // === 통합 Redis 클라이언트 ===
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis
  ) {}

  private getUserIdFromClient(client: Socket): number | null {
    const user = (client as any).user as SocketUser | undefined;
    if (!user || (!user.userId && !user.id)) return null;
    return Number(user.userId || user.id);
  }

  // 픽셀 그리기 요청
  @SubscribeMessage('draw_pixel')
  async handleDrawPixel(
    @MessageBody()
    pixel: { canvas_id: string; x: number; y: number; color: string },
    @ConnectedSocket() client: Socket
  ) {
    const userId = this.getUserIdFromClient(client);
    if (!userId) {
      client.emit('auth_error', { message: '인증 필요' });
      return;
    }
    try {
      const result: DrawPixelResponse =
        await this.canvasService.applyDrawPixelForSimulation({
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

      // canvas_id 방에만 브로드캐스트
      this.server.to(pixel.canvas_id).emit('pixel_update', {
        x: pixel.x,
        y: pixel.y,
        color: pixel.color,
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
    await client.join(data.canvas_id);
    // 쿨다운 정보 자동 푸시
    const userId = this.getUserIdFromClient(client);
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
      console.log('요청 도착:', pixel);
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
        this.server.to(pixel.canvas_id).emit('pixel_update', {
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
