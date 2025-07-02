import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  generateAccessJWT(user_id: string, userName: string): string {
    const payload = {
      sub: { userId: user_id, nickName: userName },
      jti: randomUUID(),
    };
    return this.jwtService.sign(payload, { expiresIn: '15m' });
  }

  generateRefreshJWT(user_id: string): string {
    const payload = { sub: user_id, jti: randomUUID() };
    return this.jwtService.sign(payload, { expiresIn: '7d' });
  }

  generateJWT(
    user_id: number,
    userName: string
  ): {
    access_token: string;
    refresh_token: string;
  } {
    const _id = user_id.toString();
    return {
      access_token: this.generateAccessJWT(_id, userName),
      refresh_token: this.generateRefreshJWT(_id),
    };
  }

  // async verifyAccessToken(token: string){

  // }
}
