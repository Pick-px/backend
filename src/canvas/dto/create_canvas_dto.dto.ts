/* eslint-disable @typescript-eslint/no-unsafe-call */
import { IsString, IsNotEmpty, IsNumber, IsIn, IsDate } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class createCanvasDto {
  @ApiProperty({
    example: 'canvas title',
    description: '캔버스 제목입니다.',
  })
  @IsNotEmpty({ message: '제목은 비워둘 수 없습니다.' })
  @IsString()
  title: string;

  @ApiProperty({
    example: 'public',
    description:
      '캔버스 타입입니다. enum 값이 아닌 string으로 받습니다. 현재는 public / event로만 저장 가능',
  })
  @IsIn(['public', 'event'], { message: '타입은 비워둘 수 없습니다.' })
  type: 'public' | 'event';

  @ApiProperty({
    example: '1024',
    description: '캔버스 가로축 길이입니다. number 값으로 받습니다.',
  })
  @IsNotEmpty({ message: '사이즈는 비워둘 수 없습니다.' })
  @IsNumber()
  size_x: number;

  @ApiProperty({
    example: '1024',
    description: '캔버스 세로축 길이입니다. number 값으로 받습니다.',
  })
  @IsNotEmpty({ message: '사이즈는 비워둘 수 없습니다.' })
  @IsNumber()
  size_y: number;

  @ApiProperty({
    example: new Date().toISOString(),
    description: '캔버스 시작일 (ISO8601 형식)',
  })
  @IsNotEmpty()
  @IsDate()
  startedAt: Date;

  @ApiProperty({
    example: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    description: '캔버스 종료일 (ISO8601 형식, 상시 캔버스는 null 가능)',
    required: false,
  })
  @IsDate()
  endedAt: Date;
}
