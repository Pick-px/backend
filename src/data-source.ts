import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Canvas } from './canvas/entity/canvas.entity';
import { Pixel } from './pixel/entity/pixel.entity';
import { UserCanvas } from './entity/UserCanvas.entity';
import { User } from './user/entity/user.entity';
import { Group } from './group/entity/group.entity';
import { Chat } from './group/entity/chat.entity';
import { GroupUser } from './entity/GroupUser.entity';
import * as dotenv from 'dotenv';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  ...(process.env.DATABASE_URL
    ? {
        // 프로덕션: DATABASE_URL 사용
        url: process.env.DATABASE_URL,
        ssl:
          process.env.NODE_ENV === 'production'
            ? { rejectUnauthorized: false }
            : false,
      }
    : {
        // 로컬 개발: 기존 설정 사용
        host: 'postgres',
        port: 5432,
        username: 'pixel_user',
        password: 'teamgmgdogs',
        database: 'pick_px',
      }),
  entities: [Canvas, Pixel, UserCanvas, User, Group, Chat, GroupUser],
  synchronize: false,
  migrations: ['src/migrations/*.ts'],
  migrationsTableName: 'migrations',
});
