import {
  Controller,
  Post,
  Get,
  InternalServerErrorException,
  Res,
  Req,
  Body,
  UseGuards,
  ForbiddenException,
  HttpCode,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiTags,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { Response, Request } from 'express';
import { OAuthCallbackDto } from './dto/oauth_callback_dto.dto';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { AuthRequest } from 'src/interface/AuthRequest.interface';
import { SignedCookies } from 'src/interface/SignedCookies.interface';
import { CreateGuestDto } from './dto/create-guest.dto';

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

      const at = token.access_token;
      const rt = token.refresh_token;

      res.setHeader('Authorization', `Bearer ${at}`);

      res.cookie('refresh_token', rt, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
        signed: true,
      });
      res.status(200);
    } catch (err) {
      console.error(err);
      if (err instanceof HttpException) throw err;
      throw new NotFoundException('OAuth 실패');
    }
  }

  @Post('signup')
  @ApiOperation({ summary: '게스트 회원가입(로그인) API' })
  async guestSignUp(
    @Body() createGuestDto: CreateGuestDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.userService.guestSignUp(createGuestDto.userName);
    // access_token을 헤더로, refresh_token을 쿠키로 내려줌 (OAuth와 동일)
    res.setHeader('Authorization', `Bearer ${result.access_token}`);
    res.cookie('refresh_token', result.refresh_token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 1 * 24 * 60 * 60 * 1000, // 1일
      signed: true,
    });
    // 응답 바디에는 토큰 정보 포함하지 않고, 나머지 정보만 반환
    const { access_token, refresh_token, ...rest } = result;
    return rest;
  }

  @Get('info')
  @ApiOperation({ summary: '마이페이지 API' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getUserInfo(@Req() req: AuthRequest) {
    const userId = req.user._id;

    try {
      return await this.userService.getUserInfo(userId);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new ForbiddenException('마이페이지 데이터 불러오기 실패');
    }
  }

  @Post('logout')
  @ApiOperation({ summary: '로그아웃 API' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const cookies: SignedCookies = req.signedCookies as SignedCookies;
      const refreshToken = cookies.refresh_token;
      await this.userService.logout(refreshToken);
      res.clearCookie('refresh_token', {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        signed: true,
        path: '/',
      });
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new ForbiddenException('로그아웃 실패입니다.');
    }
  }
}
