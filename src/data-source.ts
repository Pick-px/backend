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

console.log('[DB] NODE_ENV:', process.env.NODE_ENV);
console.log('[DB] DATABASE_URL 존재:', !!process.env.DATABASE_URL);

export const AppDataSource = new DataSource({
  type: 'postgres',
  ...(process.env.DATABASE_URL
    ? {
        // 프로덕션: DATABASE_URL 사용
        url: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? true : false,
        extra: process.env.NODE_ENV === 'production' ? {
          ssl: {
            rejectUnauthorized: false, // AWS RDS 인증서 문제 해결
          }
        } : {}
      }
    : {
        // 로컬 개발: 기존 설정 사용
        host: process.env.POSTGRES_HOST,
        port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
        username: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
        database: process.env.POSTGRES_DB,
      }),
  entities: [Canvas, Pixel, UserCanvas, User, Group, Chat, GroupUser],
  synchronize: false,
  migrations: ['src/migrations/*.ts'],
  migrationsTableName: 'migrations',
});
