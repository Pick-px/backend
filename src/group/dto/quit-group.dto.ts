import { ApiProperty } from '@nestjs/swagger';

export class QuitGroupDto {
  @ApiProperty({
    example: '1',
    description: '탈퇴할 그룹 ID',
  })
  group_id: string;
} 