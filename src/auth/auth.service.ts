import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  generateAccessJWT(user_id: string): string {
    const payload = { sub: user_id };
    return this.jwtService.sign(payload, { expiresIn: '15m' });
  }

  generateRefreshJWT(user_id: string): string {
    const payload = { sub: user_id, jti: randomUUID() };
    return this.jwtService.sign(payload, { expiresIn: '7d' });
  }
}
