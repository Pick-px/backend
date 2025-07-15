import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserService } from 'src/user/user.service';

type JwtPayload = {
  sub: {
    userId: string;
    nickName: string;
  };
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly userService: UserService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey:
        process.env.JWT_SECRET ??
        (() => {
          throw new Error('JWT_SECRET not defined');
        })(),
    });
  }

  async validate(payload: JwtPayload): Promise<{ _id: number }> {
    try {
      const user_id: string = payload.sub.userId;
      const user = await this.userService.findById(user_id);
      if (!user) {
        throw new UnauthorizedException('Invalid token');
      }
      return { _id: user.id };
    } catch (err) {
      console.log(err);
      throw new UnauthorizedException('Invalid token');
    }
  }
}
