// import { ApiProperty } from '@nestjs/swagger';
import { ChatMessageResponseDto } from './chat-init-response.dto';

export class ChatHistoryDataDto {
  // @ApiProperty({
  //   type: [ChatMessageResponseDto],
  //   description: '채팅 메시지 목록',
  // })
  messages: ChatMessageResponseDto[];
}

export class ChatHistoryResponseDto {
  // @ApiProperty({
  //   example: true,
  //   description: '성공 여부',
  // })
  success: boolean;

  // @ApiProperty({
  //   type: ChatHistoryDataDto,
  //   description: '응답 데이터',
  // })
  data: ChatHistoryDataDto;
} 