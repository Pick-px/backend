import { Controller, ForbiddenException, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SignedCookies } from '../interface/SignedCookies.interface';

@ApiTags('auth')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    try {
      console.log('토큰 재발급 요청 도착');
      const cookies: SignedCookies = req.signedCookies as SignedCookies;
      const refreshToken = cookies.refresh_token;
      const userId = await this.authService.checkValidationToken(refreshToken);
      res.clearCookie('refresh_token', {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        signed: true,
        path: '/',
      });
      const { access_token, refresh_token } =
        await this.authService.regeneratedJWT(userId);

      res.setHeader('Authorization', `Bearer ${access_token}`);

      res.cookie('refresh_token', refresh_token, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
        signed: true,
      });
      console.log('at: ', access_token);
      console.log('rt: ', refresh_token);
      console.log('토큰 재발급 완료');
      res.status(200).json({ message: 'token refresh success' });
    } catch (err) {
      console.log(err);
      throw new ForbiddenException('token refresh failed');
    }
  }
}
