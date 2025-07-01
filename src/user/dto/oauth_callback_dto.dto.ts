import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OAuthCallbackDto {
  @ApiProperty({
    example: 'code21dsfddcv',
    description: 'OAuth 서버에서 주는 code 값',
  })
  @IsNotEmpty({ message: 'code 값이 없습니다.' })
  @IsString()
  code: string;

  @ApiProperty({
    example: 'https://accounts.google.com/o/oauth2/v2/auth?state=google',
    description:
      '프론트에서 OAuth 로그인할때 state 값으로 요청을 보내는 곳을 명시해주세요',
  })
  @IsNotEmpty({ message: 'state 값은 필수입니다.' })
  @IsString()
  state: string;
}
