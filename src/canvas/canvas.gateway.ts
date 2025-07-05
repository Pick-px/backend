import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { CanvasService } from './canvas.service';

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
  ) {}

  private getUserIdFromClient(client: Socket): number | null {
    const user = (client as any).user as SocketUser | undefined;
    if (!user || (!user.userId && !user.id)) return null;
    return Number(user.userId || user.id);
  }

  // 픽셀 그리기 요청
  @SubscribeMessage('draw-pixel')
  async handleDrawPixel(
    @MessageBody()
    pixel: { canvas_id: string; x: number; y: number; color: string },
    @ConnectedSocket() client: Socket
  ) {
    const userId = this.getUserIdFromClient(client);
    if (!userId) {
      client.emit('auth-error', { message: '인증 필요' });
      return;
    }
    try {
      const result = await this.canvasService.applyDrawPixelWithCooldown({ ...pixel, userId });
      if (!result.success) {
        console.log(`[소켓] 사용자 ${userId}의 픽셀 그리기 실패: ${result.message}, 남은 시간: ${result.remaining}초`);
        client.emit('pixel-error', { message: result.message, remaining: result.remaining });
        return;
      }
      // canvas_id 방에만 브로드캐스트
      this.server.to(pixel.canvas_id).emit('pixel-update', {
        x: pixel.x,
        y: pixel.y,
        color: pixel.color,
        user: {
          username: 'user1',
        },
      });
    } catch (error) {
      client.emit('pixel-error', { message: '픽셀 그리기 실패' });
    }
  }

  @SubscribeMessage('join_canvas')
  async handleJoinCanvas(
    @MessageBody() data: { canvas_id: string },
    @ConnectedSocket() client: Socket
  ) {
    client.join(data.canvas_id);
    // 쿨다운 정보 자동 푸시
    const userId = this.getUserIdFromClient(client);
    if (userId && data.canvas_id) {
      try {
        const remaining = await this.canvasService.getCooldownRemaining(userId, data.canvas_id);
        client.emit('cooldown-info', { cooldown: remaining > 0, remaining });
      } catch (error) {
        // 쿨다운 정보 조회 실패 시 무시
      }
    }
  }
}
