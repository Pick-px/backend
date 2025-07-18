export interface JwtPayload {
  sub: { userId: string; nickName?: string; role: 'admin' | 'user' | 'guest' };
  jti: string;
}
