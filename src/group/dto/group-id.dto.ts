import { ApiProperty } from '@nestjs/swagger';

export class GroupIdDto {
  @ApiProperty({
    example: '1',
    description: '그룹 ID',
  })
  group_id: string;
} 