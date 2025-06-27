import {
    WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket,
  } from '@nestjs/websockets';
  import { Server, Socket } from 'socket.io';
  import { CanvasService } from './canvas.service';
  
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
      @MessageBody() pixelData: { x: number; y: number; color: string },
      @ConnectedSocket() client: Socket,
    ) {
      // 1. 유효성/동시성 검사 (선점 로직)
      const isValid = this.canvasService.tryDrawPixel(pixelData);
      if (!isValid) return; // 이미 선점된 픽셀이면 무시
  
      // 2. 모든 클라이언트에게 브로드캐스트 (자기 자신 포함)
      this.server.emit('pixel-update', pixelData);
    }
  }