import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Chat } from './entity/chat.entity';
import { User } from '../user/entity/user.entity';
import { ChatMessageDto } from './dto/chat-message.dto';
import Redis from 'ioredis';
import { GroupUser } from '../entity/GroupUser.entity';
import { Group } from './entity/group.entity';
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
export class GroupGateway {
  @WebSocketServer()
  server: Server;

  constructor(
    @InjectRepository(Chat)
    private readonly chatRepository: Repository<Chat>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(GroupUser)
    private readonly groupUserRepository: Repository<GroupUser>,
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    // === 통합 Redis 클라이언트 ===
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis
  ) {}

  // 헬퍼: 인증 유저 ID 추출
  private getUserIdFromClient(client: Socket): number | null {
    const user = (client as any).user;
    if (!user || (!user.userId && !user.id)) return null;
    return Number(user.userId || user.id);
  }

  // 헬퍼: 그룹 멤버십 체크
  private async checkGroupMembership(userId: number, groupId: number): Promise<GroupUser | null> {
    return await this.groupUserRepository.findOne({
      where: { user: { id: userId }, group: { id: groupId } },
      relations: ['user', 'group'],
    });
  }

  // 클라이언트가 특정 그룹 채팅방에 입장할 때 호출
  @SubscribeMessage('join_chat')
  async handleJoinChat(
    @MessageBody() data: { group_id: string },
    @ConnectedSocket() client: Socket
  ) {
    const userId = this.getUserIdFromClient(client);
    if (!userId) {
      client.emit('auth_error', { message: '인증 정보가 올바르지 않습니다.' });
      return;
    }
    // 그룹 참여 여부 확인
    const isMember = await this.checkGroupMembership(userId, Number(data.group_id));
    if (!isMember) {
      client.emit('chat_error', {
        message: '이 채팅방에 참여할 권한이 없습니다.',
      });
      return;
    }
    
    // 이미 해당 그룹 룸에 있으면 아무것도 하지 않음
    if (client.rooms.has(`group_${data.group_id}`)) {
      console.log(`[GroupGateway] 이미 그룹 ${data.group_id}에 참여 중`);
      return;
    }
    
    // 기존 그룹 룸에서만 leave (캔버스 룸은 유지)
    const currentRooms = Array.from(client.rooms);
    for (const room of currentRooms) {
      // 그룹 룸만 체크 (group_ 접두사가 있는 룸이 그룹 룸, canvas_ 룸은 유지)
      if (
        room !== client.id &&
        room !== `group_${data.group_id}` &&
        room.startsWith('group_')
      ) {
        client.leave(room);
      }
    }
    client.join(`group_${data.group_id}`);
  }

  // 채팅방에서 나갈 때 호출
  @SubscribeMessage('leave_chat')
  async handleLeaveChat(
    @MessageBody() data: { group_id: string },
    @ConnectedSocket() client: Socket
  ) {
    client.leave(`group_${data.group_id}`);
  }

  // 클라이언트가 채팅 메시지를 전송할 때 호출, Redis에 저장 및 브로드캐스트
  @SubscribeMessage('send_chat')
  async handleSendChat(
    @MessageBody() body: { group_id: string; message: string },
    @ConnectedSocket() client: Socket
  ) {
    try {
      const userId = this.getUserIdFromClient(client);
      if (!userId) {
        client.emit('auth_error', { message: '인증 정보가 올바르지 않습니다.' });
        return;
      }
      // 그룹 참여 여부 확인
      const isMember = await this.checkGroupMembership(userId, Number(body.group_id));
      if (!isMember) {
        client.emit('chat_error', {
          message: '이 채팅방에 참여할 권한이 없습니다.',
        });
        return;
      }
      // Redis에 메시지 push (lpush chat:{group_id})
      const now = new Date();
      const chatPayload = {
        // Redis에 저장되는 채팅 메시지의 id는 Date.now()로 임시로 부여됨, flush 시 DB에 저장할 때는 실제 DB의 auto-increment id가 부여됨
        id: Date.now(),
        user: { id: userId, user_name: isMember.user.userName },
        message: body.message,
        created_at: now.toISOString(),
      };
      // Redis에 저장 (12시간 TTL)
      const chatKey = `chat:${Number(body.group_id)}`;
      await this.redis.lpush(chatKey, JSON.stringify(chatPayload));
      
      // 채팅 리스트 크기 제한 (최대 50개)
      await this.redis.ltrim(chatKey, 0, 49);
      
      // 12시간 TTL 설정
      await this.redis.expire(chatKey, 12 * 60 * 60);
      
      // 워커로 채팅 이벤트 발행 (DB 저장을 위해)
      await this.redis.publish('chat:message', JSON.stringify({
        groupId: Number(body.group_id),
        chatData: chatPayload
      }));
      
      // 비동기 브로드캐스트 (응답 속도 향상)
      setImmediate(() => {
        this.server.to(`group_${body.group_id}`).emit('chat_message', chatPayload);
      });
    } catch (error) {
      client.emit('chat_error', {
        message: '채팅 메시지 전송 중 오류가 발생했습니다.',
      });
    }
  }
}
