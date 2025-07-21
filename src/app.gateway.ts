import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Inject } from '@nestjs/common';

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
export class AppGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer()
  server: Server;

  private broadcastTimeout: NodeJS.Timeout | null = null;
  private lastBroadcastCount: number = 0;
  private lastBroadcastTime: number = 0;

  constructor(
    private readonly jwtService: JwtService,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis
  ) {}

  afterInit(server: Server) {
    console.log('[AppGateway] afterInit 메서드 호출됨');

    // Redis Adapter 설정 (멀티서버 환경 최적화)
    const pubClient = this.redis;
    const subClient = this.redis.duplicate();

    console.log('[AppGateway] Redis 상태 확인 중...', pubClient.status);
    console.log('[AppGateway] Redis 객체 타입:', typeof pubClient);
    console.log('[AppGateway] Redis 연결 상태:', pubClient.status);

    // Redis Adapter 설정 전 연결 상태 확인
    if (pubClient.status === 'ready') {
      console.log('[AppGateway] Redis 연결 준비됨, Adapter 설정 시작');
      this.setupRedisAdapter(server, pubClient, subClient);
    } else {
      console.log(
        '[AppGateway] Redis 연결 대기 중... 현재 상태:',
        pubClient.status
      );
      pubClient.on('ready', () => {
        console.log('[AppGateway] Redis 연결 준비됨, Adapter 설정 시작');
        this.setupRedisAdapter(server, pubClient, subClient);
      });

      // 연결 실패 시 대비
      pubClient.on('error', (error) => {
        console.error('[AppGateway] Redis 연결 에러:', error);
      });
    }
  }

  private setupRedisAdapter(
    server: Server,
    pubClient: Redis,
    subClient: Redis
  ) {
    try {
      server.adapter(createAdapter(pubClient, subClient));
      console.log('[AppGateway] Redis Adapter 설정 완료');

      // 서버 시작 시 이전 소켓 ID들 정리
      this.cleanupOldSockets();

      // 모든 이벤트에 대한 디버그 리스너 추가
      server.on('connection', (socket) => {
        console.log(`[AppGateway] 클라이언트 연결됨: ${socket.id}`);
        // 모든 이벤트 로깅
        // socket.onAny((eventName, ...args) => {
        //   console.log(
        //     `[AppGateway] 이벤트 수신 [${eventName}] from ${socket.id}:`,
        //     args
        //   );
        // });
      });

      // 주기적 접속자 수 업데이트 시작
      this.startPeriodicUserCountBroadcast();
    } catch (error) {
      console.error('[AppGateway] Redis Adapter 설정 실패:', error);
    }
  }

  // 서버 시작 시 이전 소켓 ID들 정리
  private async cleanupOldSockets() {
    try {
      // 기존 active_sockets 삭제
      const oldSocketCount = await this.redis.scard('active_sockets');
      if (oldSocketCount > 0) {
        await this.redis.del('active_sockets');
      }
      // canvas:*:sockets 키 모두 삭제
      const canvasSocketKeys = await this.redis.keys('canvas:*:sockets');
      if (canvasSocketKeys.length > 0) {
        await this.redis.del(...canvasSocketKeys);
      }
    } catch (error) {
      console.error('[AppGateway] 이전 소켓/canvas 정리 중 에러:', error);
    }
  }

  async handleConnection(client: Socket) {
    const user = this.getUserFromSocket(client);
    if (user) {
      // JWT 검증 결과를 Redis 세션에 저장
      await this.saveUserSession(user, client.id);
      // console.log(`[AppGateway] 클라이언트 연결(로그인):`, user);
    } else {
      // console.log(`[AppGateway] 클라이언트 연결(비로그인):`, client.id);
    }

    // 모든 소켓 연결을 Redis에 저장 (로그인 여부와 관계없이)
    await this.redis.sadd('active_sockets', client.id);
    await this.redis.expire('active_sockets', 6000); // 10분 TTL로 단축

    // 디바운스된 접속자 수 브로드캐스트
    this.debouncedBroadcastActiveUserCount();
  }

  async handleDisconnect(client: Socket) {
    // 사용자 세션 정리
    await this.removeUserSession(client.id);
    // console.log(`[AppGateway] 유저 연결 해제:`, client.id);

    // 소켓 연결 제거
    await this.redis.srem('active_sockets', client.id);

    // 모든 캔버스에서 소켓 제거
    await this.removeSocketFromAllCanvases(client.id);

    // 디바운스된 접속자 수 브로드캐스트
    this.debouncedBroadcastActiveUserCount();
  }

  // 모든 캔버스에서 소켓 제거
  private async removeSocketFromAllCanvases(socketId: string) {
    try {
      // canvas:*:sockets 키를 모두 조회해서 해당 소켓ID를 제거
      const canvasKeys = await this.redis.keys('canvas:*:sockets');
      for (const key of canvasKeys) {
        await this.redis.srem(key, socketId);
      }
      // console.log(`[AppGateway] 소켓 ${socketId}를 모든 캔버스에서 제거함`);
    } catch (error) {
      console.error('[AppGateway] 모든 캔버스에서 소켓 제거 중 에러:', error);
    }
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

  // 사용자 세션 저장
  private async saveUserSession(user: any, socketId: string) {
    try {
      const userId = user.userId || user.id;
      const sessionKey = `socket:${socketId}:user`;
      const userKey = `user:${userId}:sockets`;

      // 소켓별 사용자 정보 저장
      const sessionData = {
        id: userId,
        username: user.nickName,
      };
      await this.redis.set(sessionKey, JSON.stringify(sessionData));
      await this.redis.expire(sessionKey, 3600);

      // 사용자별 소켓 목록 저장 (멀티 디바이스 지원)
      await this.redis.sadd(userKey, socketId);
      await this.redis.expire(userKey, 3600);

      // console.log(
      //   `[AppGateway] 사용자 ${userId} 세션 저장됨 (소켓: ${socketId})`
      // );
    } catch (error) {
      console.error('[AppGateway] 사용자 세션 저장 중 에러:', error);
    }
  }

  // 사용자 세션 제거
  private async removeUserSession(socketId: string) {
    try {
      const sessionKey = `socket:${socketId}:user`;
      const userData = await this.redis.get(sessionKey);

      if (userData) {
        const user = JSON.parse(userData);
        const userId = user.userId || user.id;
        const userKey = `user:${userId}:sockets`;

        // 소켓별 사용자 정보 제거
        await this.redis.del(sessionKey);
        // 사용자별 소켓 목록에서 제거
        await this.redis.srem(userKey, socketId);

        // 사용자의 모든 소켓이 제거되었는지 확인
        const remainingSockets = await this.redis.scard(userKey);
        if (remainingSockets === 0) {
          await this.redis.del(userKey);
        }

        // console.log(
        //   `[AppGateway] 사용자 ${userId} 세션 제거됨 (소켓: ${socketId})`
        // );
      }
    } catch (error) {
      console.error('[AppGateway] 사용자 세션 제거 중 에러:', error);
    }
  }

  // 디바운스된 접속자 수 브로드캐스트
  private debouncedBroadcastActiveUserCount() {
    // 이전 타이머가 있으면 취소
    if (this.broadcastTimeout) {
      clearTimeout(this.broadcastTimeout);
    }

    // 2초 후에 브로드캐스트 실행 (연속적인 연결/해제 시 부하 방지)
    this.broadcastTimeout = setTimeout(async () => {
      await this.broadcastActiveUserCount();
    }, 2000);
  }

  // 실시간 접속자 수 브로드캐스트 (최적화됨)
  private async broadcastActiveUserCount() {
    try {
      // 소켓 연결 수로 접속자 수 계산
      const activeSocketCount = await this.redis.scard('active_sockets');

      // 변화가 없거나 너무 빈번한 브로드캐스트 방지
      const now = Date.now();
      if (
        activeSocketCount === this.lastBroadcastCount &&
        now - this.lastBroadcastTime < 5000
      ) {
        // 5초 내 중복 방지
        return;
      }

      // 캔버스별 접속자 수 계산
      const canvasCounts = await this.getCanvasUserCounts();

      // 모든 클라이언트에게 접속자 수 전송
      this.server.emit('active_user_count', {
        count: activeSocketCount,
        canvasCounts,
        timestamp: now,
      });

      // 상태 업데이트
      this.lastBroadcastCount = activeSocketCount;
      this.lastBroadcastTime = now;

      // console.log(
      //   `[AppGateway] 실시간 접속자 수 브로드캐스트: ${activeSocketCount}명 (소켓 연결 수)`
      // );
      // console.log(`[AppGateway] 캔버스별 접속자 수:`, canvasCounts);
    } catch (error) {
      console.error('[AppGateway] 접속자 수 브로드캐스트 에러:', error);
    }
  }

  // 캔버스별 접속자 수 계산
  private async getCanvasUserCounts() {
    try {
      const canvasCounts: { [canvasId: string]: number } = {};

      // canvas:*:sockets 키들을 모두 조회
      const canvasKeys = await this.redis.keys('canvas:*:sockets');

      for (const key of canvasKeys) {
        const match = key.match(/^canvas:(\d+):sockets$/);
        if (match) {
          const canvasId = match[1];
          const count = await this.redis.scard(key);
          canvasCounts[canvasId] = count;
        }
      }

      return canvasCounts;
    } catch (error) {
      console.error('[AppGateway] 캔버스별 접속자 수 계산 에러:', error);
      return {};
    }
  }

  // 주기적 접속자 수 업데이트 (30초마다)
  private startPeriodicUserCountBroadcast() {
    setInterval(async () => {
      await this.broadcastActiveUserCount();
    }, 30000); // 30초마다 업데이트
  }
}
