import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Chat } from './entity/chat.entity';
import { User } from '../user/entity/user.entity';
import { ChatMessageDto } from './dto/chat-message.dto';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
import { GroupUser } from '../entity/GroupUser.entity';
import { Group } from './entity/group.entity';

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
export class GroupGateway {
  @WebSocketServer()
  server: Server;

  private redisClient: Redis;

  constructor(
    @InjectRepository(Chat)
    private readonly chatRepository: Repository<Chat>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(GroupUser)
    private readonly groupUserRepository: Repository<GroupUser>,
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    private readonly jwtService: JwtService
  ) {
    this.redisClient = new Redis(process.env.REDIS_URL || 'redis://redis:6379');
  }

  // JWT 토큰에서 userId 추출
  private getUserIdFromSocket(client: Socket): number | null {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.split(' ')[1];
      if (!token) return null;
      const payload = this.jwtService.decode(token) as any;
      // JWT payload 구조: { sub: { userId: "123", nickName: "사용자명" } }
      return Number(payload?.sub?.userId || payload?.userId || payload?.id);
    } catch {
      return null;
    }
  }

  // 클라이언트가 특정 그룹 채팅방에 입장할 때 호출
  @SubscribeMessage('join_chat')
  async handleJoinChat(
    @MessageBody() data: { group_id: string },
    @ConnectedSocket() client: Socket
  ) {
    const userIdFromToken = this.getUserIdFromSocket(client);
    if (!userIdFromToken) {
      client.emit('chat-error', { message: '인증 정보가 올바르지 않습니다.' });
      return;
    }
    // 그룹 참여 여부 확인
    const isMember = await this.groupUserRepository.findOne({
      where: {
        user: { id: userIdFromToken },
        group: { id: Number(data.group_id) },
      },
      relations: ['user', 'group'],
    });
    if (!isMember) {
      client.emit('chat-error', {
        message: '이 채팅방에 참여할 권한이 없습니다.',
      });
      return;
    }
    // 기존 group_id 룸에서 leave (canvas_id 룸은 유지)
    const currentRooms = Array.from(client.rooms);
    for (const room of currentRooms) {
      if (
        room !== client.id &&
        room !== data.group_id &&
        !room.startsWith('canvas_')
      ) {
        client.leave(room);
      }
    }
    client.join(data.group_id);
  }

  // 채팅방에서 나갈 때 호출
  @SubscribeMessage('leave_chat')
  async handleLeaveChat(
    @MessageBody() data: { group_id: string },
    @ConnectedSocket() client: Socket
  ) {
    // group_id 룸에서 leave
    client.leave(data.group_id);
  }

  // 클라이언트가 채팅 메시지를 전송할 때 호출, Redis에 저장 및 브로드캐스트
  @SubscribeMessage('send_chat')
  async handleSendChat(
    @MessageBody() body: { group_id: string; message: string },
    @ConnectedSocket() client: Socket
  ) {
    try {
      const userIdFromToken = this.getUserIdFromSocket(client);
      if (!userIdFromToken) {
        client.emit('chat-error', {
          message: '인증 정보가 올바르지 않습니다.',
        });
        return;
      }
      // 그룹 참여 여부 확인
      const isMember = await this.groupUserRepository.findOne({
        where: {
          user: { id: userIdFromToken },
          group: { id: Number(body.group_id) },
        },
        relations: ['user', 'group'],
      });
      if (!isMember) {
        client.emit('chat-error', {
          message: '이 채팅방에 참여할 권한이 없습니다.',
        });
        return;
      }
      // Redis에 메시지 push (lpush chat:{group_id})
      const now = new Date();
      const chatPayload = {
        // Redis에 저장되는 채팅 메시지의 id는 Date.now()로 임시로 부여됨, flush 시 DB에 저장할 때는 실제 DB의 auto-increment id가 부여됨
        id: Date.now(),
        user: { id: userIdFromToken, user_name: isMember.user.userName },
        message: body.message,
        created_at: now.toISOString(),
      };
      await this.redisClient.lpush(
        `chat:${body.group_id}`,
        JSON.stringify(chatPayload)
      );
      // 브로드캐스트
      this.server.to(body.group_id).emit('chat-message', chatPayload);
    } catch (error) {
      client.emit('chat-error', {
        message: '채팅 메시지 전송 중 오류가 발생했습니다.',
      });
    }
  }
}
