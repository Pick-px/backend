import {
  Controller,
  Post,
  InternalServerErrorException,
  Res,
  Body,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiTags,
  ApiOkResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { Response } from 'express';
import { OAuthCallbackDto } from './dto/oauth_callback_dto.dto';

@ApiTags('api/user')
@Controller('api/user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @ApiOperation({ summary: 'OAuth callback API' })
  @ApiOkResponse({
    description: 'AT : Authorization Bearer access_token, RT : refresh_token  ',
  })
  @ApiBadRequestResponse({ description: 'OAuth callback 실패' })
  @Post('oauth/login')
  async OAuthLogin(
    @Body() query: OAuthCallbackDto,
    @Res({ passthrough: true }) res: Response
  ) {
    try {
      if (
        !query.state ||
        (query.state != 'google' &&
          query.state != 'kakao' &&
          query.state != 'naver')
      ) {
        throw new InternalServerErrorException('Invalid state');
      }
      const token = await this.userService.OAuthCodeCheck(query);
      if (!token) throw new InternalServerErrorException('Token 발급 실패');

      const at = token.accessToken;
      const rt = token.refreshToken;

      console.log(typeof at);

      res.setHeader('Authorization', `Bearer ${at}`);

      res.cookie('refresh_token', rt, {
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
      });
      res.status(200);
    } catch (err) {
      //   const message: string = err.message;
      res.send(404);
    }
  }
}
