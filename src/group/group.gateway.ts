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

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:5173', 'https://ws.pick-px.com'],
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
  ) {}

  @SubscribeMessage('join_chat')
  handleJoinChat(
    @MessageBody() data: { group_id: string; user_id: string },
    @ConnectedSocket() client: Socket
  ) {
    client.join(data.group_id);
  }

  @SubscribeMessage('send_chat')
  async handleSendChat(
    @MessageBody() body: { group_id: string; user_id: string; message: string },
    @ConnectedSocket() client: Socket
  ) {
    try {
      // DB에 저장
      const chat = this.chatRepository.create({
        groupId: Number(body.group_id),
        userId: Number(body.user_id),
        message: body.message,
      });
      const savedChat = await this.chatRepository.save(chat);
      // 유저 정보 조회
      const user = await this.userRepository.findOne({ where: { id: Number(body.user_id) } });
      if (!user) {
        client.emit('chat-error', { message: '유저 정보를 찾을 수 없습니다.' });
        return;
      }
      // 브로드캐스트
      const chatPayload: ChatMessageDto = {
        id: savedChat.id,
        user: {
          id: user.id,
          user_name: user.userName,
        },
        message: savedChat.message,
        created_at: savedChat.createdAt,
      };
      this.server.to(body.group_id).emit('chat-message', chatPayload);
    } catch (error) {
      client.emit('chat-error', {
        message: '채팅 메시지 전송 중 오류가 발생했습니다.',
      });
    }
  }
} 