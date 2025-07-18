import { Injectable, Inject, NotFoundException } from '@nestjs/common';
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
import { JwtPayload } from '../interface/JwtPaylod.interface';
import { v4 as uuidv4 } from 'uuid';

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
  ): Promise<{ access_token: string; refresh_token: string } | undefined> {
    const code = query.code;
    const site = query.state || '';
    const payload = this.generateParam(code, site);
    const url = this.generateUrl(site);
    let response: { data: CommonTokenResponse };
    try {
      response = await firstValueFrom(
        this.httpService.post(url, payload.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        })
      );
    } catch (err) {
      console.log(err);
      console.log('에러발생');
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
      const result: { access_token: string; refresh_token: string } =
        await this.userSignUpOrLogin(userInfo);
      const jti: string = this.jwtService.decode(result.refresh_token);
      const SEVEN_DAYS_IN_SECONDS = 60 * 60 * 24 * 7;
      await this.redis.set(
        jti,
        result.refresh_token,
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

  private async userSignUpOrLogin(userInfo: GoogleUserPayload): Promise<{
    access_token: string;
    refresh_token: string;
  }> {
    const user = await this.userRepository.findOne({
      where: { email: userInfo.email },
    });
    if (user == null) {
      const newUser = this.userRepository.create({
        email: userInfo.email,
        createdAt: new Date(),
        updatedAt: new Date(),
        userName: userInfo.userName,
        role: 'user',
      });
      try {
        const result = await this.userRepository.save(newUser);
        const token = this.authService.generateJWT(result.id, result.userName, result.role);
        return token;
      } catch (err) {
        const existUser = await this.userRepository.findOne({
          where: { email: newUser.email },
        });

        if (!existUser) throw new Error('동시성 문제 발생!');

        return this.authService.generateJWT(existUser.id, existUser.userName, existUser.role);
      }
    } else {
      return this.authService.generateJWT(user.id, user.userName, user.role);
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

  async findById(user_id: string): Promise<User> {
    const result = await this.userRepository.findOne({
      where: { id: Number(user_id) },
    });
    if (!result) throw new Error('유저 정보가 없습니다.');

    return result;
  }

  async getUserInfo(_id: number) {
    try {
      const user = await this.userRepository.findOne({
        where: { id: _id },
        relations: ['userCanvases', 'userCanvases.canvas'],
      });
      if (!user) {
        throw new NotFoundException('유저를 찾을 수 없습니다.');
      }
      const canvases = (user.userCanvases || []).map((uc) => ({
        canvasId: uc.canvas.id,
        title: uc.canvas.title,
        created_at: uc.canvas.createdAt,
        started_at: uc.canvas.startedAt,
        ended_at: uc.canvas.endedAt,
        size_x: uc.canvas.sizeX,
        size_y: uc.canvas.sizeY,
        try_count: uc.tryCount,
        own_count:
          uc.canvas.endedAt && uc.canvas.type !== 'public'
            ? uc.ownCount
            : null,
      }));
      return {
        email: user.email,
        nickName: user.userName,
        canvases,
      };
    } catch (err) {
      throw new NotFoundException('유저 정보 조회 실패');
    }
  }

  async logout(token: string) {
    try {
      const payload: JwtPayload = this.jwtService.decode<JwtPayload>(token);
      const jti = payload.jti;
      await this.redis.del(jti);
    } catch (err) {
      throw new NotFoundException('로그아웃 실패: 레디스에서 토큰 삭제 실패');
    }
  }

  async guestSignUp(userName: string) {
    // uuid로 이메일 생성
    const uuid = uuidv4();
    const email = `${uuid}@guest.local`;
    // 이메일 중복 체크
    const exist = await this.userRepository.findOne({ where: { email } });
    if (exist) {
      throw new Error('이미 존재하는 이메일입니다.');
    }
    const now = new Date();
    const newUser = this.userRepository.create({
      email: email,
      password: null,
      createdAt: now,
      updatedAt: now,
      userName: userName,
      role: 'guest',
    });
    const saved: User = await this.userRepository.save(newUser);
    const token = await this.authService.generateJWT(saved.id, saved.userName, saved.role);
    return {
      isSuccess: true,
      code: '200',
      message: '요청에 성공하였습니다.',
      createdAt: now.toISOString(),
      data: 'Join Success',
      access_token: token.access_token,
      refresh_token: token.refresh_token,
    };
  }
}
