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
import { CanvasHistory } from './canvas/entity/canvasHistory.entity';
import { ImageHistory } from './canvas/entity/imageHistory.entity';
import { Question } from './entity/questions.entity';
import { QuestionUser } from './game/entity/question_user.entity';
import { GameUserResult } from './game/entity/game_result.entity';

dotenv.config();

console.log('[DB] NODE_ENV:', process.env.NODE_ENV);
console.log('[DB] DATABASE_URL 존재:', !!process.env.DATABASE_URL);

export const AppDataSource = new DataSource({
  type: 'postgres',
  ...(process.env.DATABASE_URL
    ? {
        // 프로덕션: DATABASE_URL 사용
        url: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      }
    : {
        // 로컬 개발: 기존 설정 사용
        host: process.env.POSTGRES_HOST,
        port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
        username: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
        database: process.env.POSTGRES_DB,
        ssl: false, // SSL 명시적 비활성화
      }),
  entities: [
    Canvas,
    Pixel,
    UserCanvas,
    User,
    Group,
    Chat,
    GroupUser,
    CanvasHistory,
    ImageHistory,
    Question,
    QuestionUser,
    GameUserResult,
  ],
  synchronize: false,
  migrations: ['src/migrations/*.ts'],
  migrationsTableName: 'migrations',
});
