/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Matches,
  IsDate,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import { Type } from 'class-transformer';

dayjs.extend(utc);
dayjs.extend(timezone);
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
  @IsString()
  @Matches(/^public$|^event_.*$|^game_.*$/, {
    message: 'type must be public, event_*, or game_*',
  })
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
    example: dayjs().tz('Asia/Seoul').format(),
    description: '캔버스 시작일 (ISO8601 형식)',
  })
  @Type(() => Date)
  @IsNotEmpty()
  @IsDate()
  startedAt: Date;

  @ApiProperty({
    example: dayjs().tz('Asia/Seoul').add(3, 'minute').format(),
    description: '캔버스 종료일 (ISO8601 형식, 상시 캔버스는 null 가능)',
    required: false,
  })
  @Type(() => Date)
  @IsDate()
  endedAt: Date;
}
