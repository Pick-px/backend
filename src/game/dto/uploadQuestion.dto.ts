import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, IsArray } from 'class-validator';

export class UploadQuestionDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  question: string;

  @ApiProperty()
  @IsArray()
  options: string[];

  @ApiProperty()
  @IsNumber()
  answer: number;
}
