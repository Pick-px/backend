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
  
    // 클라이언트가 소켓 연결 시
    handleConnection(client: Socket) {
      console.log('클라이언트 연결됨:', client.id);
    }
  
    // 클라이언트 연결 해제 시
    handleDisconnect(client: Socket) {
      console.log('클라이언트 연결 해제:', client.id);
    }
  
    // 초기 캔버스 데이터 요청
    @SubscribeMessage('get-canvas')
    async handleGetCanvas(
      @MessageBody() data: { canvas_id: string },
      @ConnectedSocket() client: Socket
    ) {
      try {
        const canvasData = await this.canvasService.getAllPixels(data.canvas_id);
        // 요청한 클라이언트에게만 전송
        client.emit('canvas-data', canvasData);
      } catch (error) {
        console.error('캔버스 데이터 조회 실패:', error);
        client.emit('error', { message: '캔버스 데이터 조회 실패' });
      }
    }
  
    // 픽셀 그리기 요청
    @SubscribeMessage('draw-pixel')
    async handleDrawPixel(
      @MessageBody() pixel: { canvas_id: string; x: number; y: number; color: string },
      @ConnectedSocket() client: Socket,
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
      @ConnectedSocket() client: Socket,
    ) {
      client.join(data.canvas_id);
    }

    @SubscribeMessage('join_chat')
    handleJoinChat(
      @MessageBody() data: { group_id: string; user_id: string },
      @ConnectedSocket() client: Socket,
    ) {
      client.join(data.group_id);
    }

    @SubscribeMessage('send_chat')
    async handleSendChat(
      @MessageBody() body: { group_id: string; user_id: string; message: string },
      @ConnectedSocket() client: Socket,
    ) {
      try {
        // !!수정필요!! 실제로는 DB에 저장하고 messageId, user, timestamp 등 생성해야 함 
        const chatPayload = {
          messageId: Math.floor(Math.random() * 100000), // 임시
          user: {
            userId: body.user_id,
            // userName: ... // 필요시 추가
          },
          message: body.message,
          timestamp: new Date().toISOString(),
        };
        this.server.to(body.group_id).emit('chat-message', chatPayload);
      } catch (error) {
        client.emit('chat-error', { message: '채팅 메시지 전송 중 오류가 발생했습니다.' });
      }
    }
  }