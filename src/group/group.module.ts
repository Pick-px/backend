import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Group } from './entity/group.entity';
import { Chat } from './entity/chat.entity';
import { User } from '../user/entity/user.entity';
import { GroupService } from './group.service';
import { GroupController } from './group.controller';
import { GroupGateway } from './group.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([Group, Chat, User]),
  ],
  providers: [GroupService, GroupGateway],
  controllers: [GroupController],
  exports: [GroupService, TypeOrmModule],
})
export class GroupModule {}
