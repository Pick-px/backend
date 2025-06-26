import {
    WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket,
  } from '@nestjs/websockets';
  import { Server, Socket } from 'socket.io';
  import { CanvasService } from './canvas.service';
  
  @WebSocketGateway({ cors: true })
  export class CanvasGateway {
    @WebSocketServer()
    server: Server;
  
    constructor(private readonly canvasService: CanvasService) {}
  
    // 클라이언트가 room 입장
    @SubscribeMessage('join')
    handleJoin(
      @MessageBody() data: { canvas_id: string },
      @ConnectedSocket() client: Socket,
    ) {
      client.join(data.canvas_id);
    }
  
    // 채팅 이벤트
    @SubscribeMessage('chat')
    handleChat(
      @MessageBody() body: { canvas_id: string; message: string },
      @ConnectedSocket() client: Socket,
    ) {
      this.server.to(body.canvas_id).emit('chat', {
        user: client.id,
        message: body.message,
      });
    }
  
    // 픽셀 업데이트 이벤트
    @SubscribeMessage('pixel_update')
    async handlePixelUpdate(
      @MessageBody() body: { canvas_id: string; x: number; y: number; color: string },
      @ConnectedSocket() client: Socket,
    ) {
      // 저장 (DB/메모리 등)
      await this.canvasService.savePixel(body.canvas_id, body.x, body.y, body.color);
  
      // 같은 room에 브로드캐스트
      this.server.to(body.canvas_id).emit('pixel_update', {
        x: body.x,
        y: body.y,
        color: body.color,
      });
    }
  }