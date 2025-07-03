import {
  Injectable,
  Inject,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { InvalidCodeFieldError } from 'google-auth-library/build/src/auth/executable-response';
import { User } from '../user/entity/user.entity';
import Redis from 'ioredis';

interface JwtPayload {
  sub: { userId: string; nickName?: string };
  jti: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    @Inject('REDIS_CLIENT')
    private readonly redisClient: Redis,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>
  ) {}

  async generateAccessJWT(user_id: string, userName: string): Promise<string> {
    const payload = {
      sub: { userId: user_id, nickName: userName },
      jti: randomUUID(),
    };
    return this.jwtService.sign(payload, { expiresIn: '15m' });
  }

  async generateRefreshJWT(user_id: string): Promise<string> {
    const payload = { sub: { userId: user_id }, jti: randomUUID() };
    const refresh_token = this.jwtService.sign(payload, { expiresIn: '7d' });
    await this.setRefreshTokenInRedis(payload.jti, refresh_token);
    return refresh_token;
  }

  async generateJWT(
    user_id: number,
    userName: string
  ): Promise<{ access_token: string; refresh_token: string }> {
    const _id = user_id.toString();
    return {
      access_token: await this.generateAccessJWT(_id, userName),
      refresh_token: await this.generateRefreshJWT(_id),
    };
  }

  async checkValidationToken(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      if (!payload) throw new InvalidCodeFieldError('payload가 없습니다.');
      const jti = payload.jti;

      const storedToken = await this.redisClient.get(jti);
      if (storedToken !== token) {
        throw new UnauthorizedException('유효하지 않은 토큰입니다.');
      }

      if (!payload.sub) throw new InvalidCodeFieldError('userId가 없습니다.');

      return payload.sub.userId;
    } catch (err) {
      throw new UnauthorizedException('토큰 검증 실패');
    }
  }

  async regeneratedJWT(userId: string) {
    try {
      const user = await this.userRepository.findOne({
        where: { id: Number(userId) },
      });

      if (!user) throw new NotFoundException('유저가 없습니다.');

      const token = await this.generateJWT(user.id, user.userName);
      const payload: JwtPayload = this.jwtService.decode<JwtPayload>(
        token.refresh_token
      );
      await this.setRefreshTokenInRedis(payload.jti, token.refresh_token);
      return token;
    } catch (err) {
      throw new UnauthorizedException('토큰 재발급에 실패했습니다.');
    }
  }

  async setRefreshTokenInRedis(jti: string, refreshToken: string) {
    const SEVEN_DAYS_IN_SECONDS = 60 * 60 * 24 * 7;
    await this.redisClient.set(jti, refreshToken, 'EX', SEVEN_DAYS_IN_SECONDS);
  }
}
