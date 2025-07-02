import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entity/user.entity';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { OAuthCallbackDto } from './dto/oauth_callback_dto.dto';
import { OAuth2Client } from 'google-auth-library';
import { AxiosError } from 'axios';
import { AuthService } from 'src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';

interface CommonTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number | string;
}

interface GoogleTokenResponse extends CommonTokenResponse {
  scope: string;
  id_token?: string;
}

interface KakaoTokenResponse extends CommonTokenResponse {
  scope: string;
  refresh_token_expires_in?: number;
}

interface NaverTokenResponse extends CommonTokenResponse {}

interface GoogleUserPayload {
  email: string;
  userName: string;
}

interface JwtTokenInterface {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly authService: AuthService,
    private readonly httpService: HttpService,
    private readonly jwtService: JwtService,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis
  ) {}

  async OAuthCodeCheck(
    query: OAuthCallbackDto
  ): Promise<JwtTokenInterface | undefined> {
    const code = query.code;
    const site = query.state || '';
    const payload = this.generateParam(code, site);
    const url = this.generateUrl(site);
    let response: { data: CommonTokenResponse };
    console.log('payload', payload);
    console.log('url', url);
    try {
      response = await firstValueFrom(
        this.httpService.post(url, payload.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        })
      );
      console.log('response', response);
    } catch (err) {
      console.log("에러발생");
      //console.error(err);
      throw new Error('토큰 요청 중 오류 발생');
    }

    if (site === 'google') {
      const data = response.data as GoogleTokenResponse;
      const userInfo: GoogleUserPayload = await this.googleUserVerify(
        data.id_token
      );
      if (userInfo == null) {
        throw new Error('not verified user in google');
      }
      const result: JwtTokenInterface = await this.userSignUpOrLogin(userInfo);
      const jti: string = this.jwtService.decode(result.refreshToken);
      const SEVEN_DAYS_IN_SECONDS = 60 * 60 * 24 * 7;
      await this.redis.set(
        jti,
        result.refreshToken,
        'EX',
        SEVEN_DAYS_IN_SECONDS
      );
      console.log('result', result);
      return result;
    } else if (site === 'kakao') {
      const data = response.data as KakaoTokenResponse;
      return undefined;
    } else if (site === 'naver') {
      const data = response.data as NaverTokenResponse;
      return undefined;
    } else {
      return undefined;
    }
  }

  private async userSignUpOrLogin(
    userInfo: GoogleUserPayload
  ): Promise<JwtTokenInterface> {
    const user = await this.userRepository.findOne({
      where: { email: userInfo.email },
    });

    console.log(user);

    if (user == null) {
      const newUser = this.userRepository.create({
        email: userInfo.email,
        createdAt: new Date(),
        updatedAt: new Date(),
        userName: userInfo.userName,
      });

      const result = await this.userRepository.save(newUser);
      const at = this.authService.generateAccessJWT(result.email);
      const rt = this.authService.generateRefreshJWT(result.email);
      return {
        accessToken: at,
        refreshToken: rt,
      };
    } else {
      const at = this.authService.generateAccessJWT(user.email);
      const rt = this.authService.generateRefreshJWT(user.email);
      return {
        accessToken: at,
        refreshToken: rt,
      };
    }
  }

  private async googleUserVerify(
    id_token: string | undefined
  ): Promise<GoogleUserPayload> {
    if (id_token === undefined) {
      throw new Error('id_token is undefined');
    }
    const idToken: string = id_token;

    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload?.email) throw new Error('Google ID token에 이메일 없음');
    const userName = payload.name ?? payload.given_name ?? 'GoogleUser';
    return {
      email: payload.email,
      userName: userName,
    };
  }

  private generateUrl(site: string) {
    const google = 'https://oauth2.googleapis.com/token';
    const kakao = 'https://kauth.kakao.com/oauth/token';
    const naver = 'https://nid.naver.com/oauth2.0/token';

    if (site == 'google') return google;
    else if (site == 'kakao') return kakao;
    else if (site == 'naver') return naver;
    else return '';
  }

  private generateParam(code: string, site: string) {
    let clientId: string;
    let clientSecret: string;
    let redirectUri: string;
    if (site == 'google') {
      clientId = process.env.GOOGLE_CLIENT_ID || '';
      clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
      redirectUri = process.env.GOOGLE_REDIRECT_URI || '';
    } else if (site == 'kakao') {
      clientId = process.env.KAKAO_CLIENT_ID || '';
      clientSecret = process.env.KAKAO_CLIENT_SECRET || '';
      redirectUri = process.env.KAKAO_REDIRECT_URI || '';
    } else if (site == 'naver') {
      clientId = process.env.NAVER_CLIENT_ID || '';
      clientSecret = process.env.NAVER_CLIENT_SECRET || '';
      redirectUri = process.env.NAVER_REDIRECT_URI || '';
    } else {
      clientId = '';
      clientSecret = '';
      redirectUri = '';
    }

    return new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
  }
}
