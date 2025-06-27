import { Module } from '@nestjs/common';
import { CanvasGateway } from './canvas.gateway';
import { CanvasService } from './canvas.service';
import { SubscribeMessage, ConnectedSocket, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MessageBody } from '@nestjs/websockets';

@Module({
  providers: [CanvasGateway, CanvasService],
})
export class CanvasModule {
    @WebSocketServer()
    server: Server;
  @SubscribeMessage('join')
  handleJoin(
    @MessageBody() data: { canvas_id: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(data.canvas_id);
  }

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
}