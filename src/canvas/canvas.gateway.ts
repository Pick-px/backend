import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { CanvasService } from './canvas.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:5173', 'https://ws.pick-px.com'],
    credentials: true,
  },
})
export class CanvasGateway {
  @WebSocketServer()
  server: Server;

  constructor(private readonly canvasService: CanvasService) {}

  // 클라이언트가 소켓 연결 시
  handleConnection(client: Socket) {
    console.log('클라이언트 연결됨:', client.id);
  }

  // 클라이언트 연결 해제 시
  handleDisconnect(client: Socket) {
    console.log('클라이언트 연결 해제:', client.id);
  }

  // 픽셀 그리기 요청
  @SubscribeMessage('draw-pixel')
  async handleDrawPixel(
    @MessageBody()
    pixel: { canvas_id: string; x: number; y: number; color: string },
    @ConnectedSocket() client: Socket
  ) {
    try {
      const isValid = await this.canvasService.applyDrawPixel(pixel);
      if (!isValid) return;
      // canvas_id 방에만 브로드캐스트
      this.server.to(pixel.canvas_id).emit('pixel-update', {
        x: pixel.x,
        y: pixel.y,
        color: pixel.color,
        // user: {
        //   username: 'user1'
        // }
      });
    } catch (error) {
      console.error('픽셀 그리기 실패:', error);
      client.emit('error', { message: '픽셀 그리기 실패' });
    }
  }

  @SubscribeMessage('join_canvas')
  handleJoinCanvas(
    @MessageBody() data: { canvas_id: string },
    @ConnectedSocket() client: Socket
  ) {
    client.join(data.canvas_id);
  }
}
