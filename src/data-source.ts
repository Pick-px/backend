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
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

console.log('[DB] NODE_ENV:', process.env.NODE_ENV);
console.log('[DB] DATABASE_URL 존재:', !!process.env.DATABASE_URL);

// SSL 설정 함수
const getSSLConfig = () => {
  if (process.env.NODE_ENV !== 'production') {
    return false;
  }

  // CA 인증서 파일 경로들
  const caPaths = [
    '/app/certs/ap-northeast-2-bundle.pem',
    '/app/certs/global-bundle.pem',
  ];

  // 사용 가능한 CA 인증서 찾기
  for (const caPath of caPaths) {
    if (fs.existsSync(caPath)) {
      console.log(`[DB] CA 인증서 사용: ${caPath}`);
      return {
        rejectUnauthorized: true,
        ca: fs.readFileSync(caPath).toString(),
      };
    }
  }

  console.log('[DB] CA 인증서 파일을 찾을 수 없음, rejectUnauthorized: false 사용');
  return {
    rejectUnauthorized: false,
  };
};

export const AppDataSource = new DataSource({
  type: 'postgres',
  ...(process.env.DATABASE_URL
    ? {
        // 프로덕션: DATABASE_URL 사용
        url: process.env.DATABASE_URL,
        ssl: getSSLConfig(),
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
