import {
    WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket,
  } from '@nestjs/websockets';
  import { Server, Socket } from 'socket.io';
  import { CanvasService } from './canvas.service';
  import { PixelData } from './interfaces/pixel-data.interface';
  
  @WebSocketGateway({ 
    cors: {
    origin: 'http://localhost:5173',
    credentials: true,
    },
  })
  export class CanvasGateway {
    @WebSocketServer()
    server: Server;
  
    constructor(private readonly canvasService: CanvasService) {}
  
    // 1. 클라이언트가 소켓 연결 시
    handleConnection(client: Socket) {
      console.log('클라이언트 연결됨:', client.id);
    }
  
    // 2. 클라이언트 연결 해제 시
    handleDisconnect(client: Socket) {
      console.log('클라이언트 연결 해제:', client.id);
    }
  
    // 3. 초기 캔버스 데이터 요청
    @SubscribeMessage('get-canvas')
    handleGetCanvas(@ConnectedSocket() client: Socket) {
      const canvasData = this.canvasService.getAllPixels();
      // 요청한 클라이언트에게만 전송
      client.emit('canvas-data', canvasData);
    }
  
    // 4. 픽셀 그리기 요청
    @SubscribeMessage('draw-pixel')
    handleDrawPixel(
      @MessageBody() pixel: PixelData,
      @ConnectedSocket() client: Socket,
    ) {
      const isValid = this.canvasService.applyDrawPixel(pixel);
      if (!isValid) return;
      this.server.emit('pixel-update', pixel);
    }
    
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
        message: body.message,
      });
    }
  }