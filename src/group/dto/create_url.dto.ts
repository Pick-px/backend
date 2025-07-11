import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePreSignedUrl {
  @ApiProperty({
    example: '1',
    description: 'group_id를 보내시면 됩니다.',
  })
  @IsString({ message: 'group_id 보내시면 됩니다.' })
  group_id: string;

  @ApiProperty({
    example: 'img/jpg',
    description: '컨텐츠 타입(jpg, png) 보내시면 됩니다.',
  })
  @IsString()
  @Matches(/^image\/(jpg|jpeg|png|webp)$/, {
    message: '지원되는 이미지 형식은 jpeg, png, jpg, webp입니다.',
  })
  contentType: string;
}
