// import { Injectable, UnauthorizedException } from '@nestjs/common';
// import { PassportStrategy } from '@nestjs/passport';
// import { ExtractJwt, Strategy } from 'passport-jwt';
// import { UserService } from 'src/user/user.service';

// @Injectable()
// export class JwtStrategy extends PassportStrategy(Strategy) {
//   constructor(private readonly userService: UserService) {
//     super({
//       jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
//       secretOrKey: process.env.JWT_SECRET,
//     });
//   }

//   async validate(payload: any) {
//     try {
//       console.log(payload);
//       const user = await this.userService.findById(payload.sub);

//       if (!user) {
//         throw new UnauthorizedException('Invalid token');
//       }
//     } catch (err) {
//       throw new UnauthorizedException('Invalid token');
//     }

//     return user;
//   }
// }
