import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

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
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket) {
    const user = this.getUserFromSocket(client);
    if (user) {
      (client as any).user = user;
      console.log(`[AppGateway] 클라이언트 연결(로그인):`, user);
    } else {
      console.log(`[AppGateway] 클라이언트 연결(비로그인):`, client.id);
      //   // 연결은 유지, context에 user 저장 안함
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`[AppGateway] 유저 연결 해제:`, client.id);
  }

  // JWT 토큰에서 유저 정보 추출
  getUserFromSocket(client: Socket): any {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.split(' ')[1];
      if (!token) return null;
      const payload = this.jwtService.verify(token) as any;
      return payload?.sub || payload || null;
    } catch (err) {
      console.error('[소켓 토큰 verify 실패]', err);
      return null;
    }
  }
}
