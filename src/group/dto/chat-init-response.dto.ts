import { ApiProperty } from '@nestjs/swagger';

export class GroupInfoDto {
  @ApiProperty({
    example: '1',
    description: '그룹 ID',
  })
  group_id: string;

  @ApiProperty({
    example: 'team gmg',
    description: '그룹 제목',
  })
  group_title: string;

  @ApiProperty({
    example: '123',
    description: '그룹 방장(생성자) ID',
  })
  made_by: string;
}

export class ChatMessageResponseDto {
  @ApiProperty({
    example: 130,
    description: '메시지 ID',
  })
  messageId: number;

  @ApiProperty({
    example: { userId: '1', name: 'Alice' },
    description: '메시지 작성자 정보',
  })
  user: { userId: string; name: string };

  @ApiProperty({
    example: '가장 최신 메시지',
    description: '메시지 내용',
  })
  content: string;

  @ApiProperty({
    example: '2025-06-30T16:00:00Z',
    description: '메시지 작성 시간',
  })
  timestamp: string;
}

export class ChatInitDataDto {
  @ApiProperty({
    example: '1',
    description: '기본 그룹 ID',
  })
  defaultGroupId: string;

  @ApiProperty({
    type: [GroupInfoDto],
    description: '사용자가 참여중인 그룹 목록',
  })
  groups: GroupInfoDto[];

  @ApiProperty({
    type: [ChatMessageResponseDto],
    description: '최신 메시지 목록',
  })
  messages: ChatMessageResponseDto[];
}

export class ChatInitResponseDto {
  @ApiProperty({
    example: true,
    description: '성공 여부',
  })
  success: boolean;

  @ApiProperty({
    example: '200',
    description: '상태 코드',
  })
  status: string;

  @ApiProperty({
    example: '요청에 성공하였습니다.',
    description: '응답 메시지',
  })
  message: string;

  @ApiProperty({
    type: ChatInitDataDto,
    description: '응답 데이터',
  })
  data: ChatInitDataDto;
} 