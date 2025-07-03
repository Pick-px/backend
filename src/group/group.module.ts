import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Group } from './entity/group.entity';
import { Chat } from './entity/chat.entity';
import { User } from '../user/entity/user.entity';
import { GroupService } from './group.service';
import { GroupController } from './group.controller';
import { GroupGateway } from './group.gateway';
import { GroupUser } from '../entity/GroupUser.entity';
import { JwtModule } from '@nestjs/jwt';
import { UserModule } from '../user/user.module';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Group, Chat, User, GroupUser]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your_jwt_secret',
      signOptions: { expiresIn: '1d' },
    }),
    UserModule,
    PassportModule,
    forwardRef(() => AuthModule),
  ],
  providers: [GroupService, GroupGateway],
  controllers: [GroupController],
  exports: [GroupService, TypeOrmModule],
})
export class GroupModule {}
