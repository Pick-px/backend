import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from './redis/redis.module'; // 추가된 부분
import { CanvasModule } from './canvas/canvas.module';
import { PixelService } from './pixel/pixel.service';
import { DatabaseModule } from './database/database.module';
import { TypeOrmModule } from '@nestjs/typeorm';

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
      synchronize: true,
    }),
    RedisModule,
    CanvasModule,
    DatabaseModule,
  ],
  controllers: [AppController],
  providers: [AppService, PixelService],
})
export class AppModule {}
