import { IsString, IsDecimal, Matches } from 'class-validator';

export class CreatePreSignedUrl {
  @IsString()
  key: string;

  @IsString()
  @Matches(/^image\/(jpeg|png|gif|webp)$/, {
    message: '지원되는 이미지 형식은 jpeg, png, gif, webp입니다.',
  })
  contentType: string;

  @IsString()
  group_id: string;

  @IsDecimal()
  x: number;

  @IsDecimal()
  y: number;
}
