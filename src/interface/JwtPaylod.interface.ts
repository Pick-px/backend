export interface JwtPayload {
  sub: { userId: string; nickName?: string };
  jti: string;
}
