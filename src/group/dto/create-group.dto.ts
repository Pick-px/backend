// import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min, Max, IsNotEmpty, IsString } from 'class-validator';
import { Type } from 'class-transformer';
export class CreateGroupDto {
  // @ApiProperty({
  //   example: 'team',
  //   description: '그룹 이름입니다.',
  // })
  @IsNotEmpty()
  @IsString()
  name: string;

  // @ApiProperty({
  //   example: '15',
  //   description: '최대 그룹 인원. 최대 100명 가능',
  // })
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  maxParticipants: number;

  // @ApiProperty({
  //   example: '1',
  //   description: '캔버스 id.',
  // })
  @IsNotEmpty()
  canvasId: string;
}
