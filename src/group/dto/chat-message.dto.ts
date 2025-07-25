// import { ApiProperty } from '@nestjs/swagger';

export class ChatMessageDto {
  // @ApiProperty()
  id: number;
  // @ApiProperty()
  user: { id: number; user_name: string };
  // @ApiProperty()
  message: string;
  // @ApiProperty()
  created_at: Date;
} 