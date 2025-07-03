import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Canvas } from './canvas/entity/canvas.entity';
import { Pixel } from './pixel/entity/pixel.entity';
import { UserCanvas } from './entity/UserCanvas.entity';
import { User } from './user/entity/user.entity';
import { Group } from './group/entity/group.entity';
import { Chat } from './group/entity/chat.entity';
import { GroupUser } from './entity/GroupUser.entity';
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: 'postgres',
  port: 5432,
  username: 'pixel_user',
  password: 'teamgmgdogs', // 환경 변수로 대체해도 좋음
  database: 'pick_px',
  entities: [Canvas, Pixel, UserCanvas, User, Group, Chat, GroupUser],
  synchronize: false,
});

