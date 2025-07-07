import { ApiProperty } from '@nestjs/swagger';
export class CreateGroupDto {
  @ApiProperty({
    example: 'team',
    description: '그룹 이름입니다.',
  })
  name: string;
  @ApiProperty({
    example: '15',
    description: '최대 그룹 인원. 최대 100명 가능',
  })
  maxParticipants: string;
  @ApiProperty({
    example: '1',
    description: '캔버스 id.',
  })
  canvasId: string;
}
