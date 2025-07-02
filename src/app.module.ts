import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from './redis/redis.module'; // 추가된 부분
import { CanvasModule } from './canvas/canvas.module';
import { DatabaseModule } from './database/database.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserController } from './user/user.controller';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { UserCanvas } from './entity/UserCanvas.entity';
import { Pixel } from './pixel/entity/pixel.entity';
import { User } from './user/entity/user.entity';
import { Canvas } from './canvas/entity/canvas.entity';
import { GroupController } from './group/group.controller';
import { GroupService } from './group/group.service';
import { GroupModule } from './group/group.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // 전역 모듈로 설정 (옵션)
      envFilePath: '.env', // 기본값이지만 명시 가능
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'postgres',
      port: 5432,
      username: 'pixel_user',
      password: 'teamgmgdogs',
      database: 'pick_px',
      autoLoadEntities: true,
      entities: [User, Canvas, UserCanvas, Pixel],
    }),
    RedisModule,
    CanvasModule,
    DatabaseModule,
    UserModule,
    AuthModule,
    GroupModule,
  ],
  controllers: [AppController, UserController, GroupController],
  providers: [AppService, GroupService],
})
export class AppModule {}
