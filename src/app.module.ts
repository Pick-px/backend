import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisModule } from './redis/redis.module';
import { CanvasModule } from './canvas/canvas.module';
import { DatabaseModule } from './database/database.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { UserCanvas } from './entity/UserCanvas.entity';
import { Pixel } from './pixel/entity/pixel.entity';
import { User } from './user/entity/user.entity';
import { Canvas } from './canvas/entity/canvas.entity';
import { GroupModule } from './group/group.module';
import { Group } from './group/entity/group.entity';
import { GroupUser } from './entity/GroupUser.entity';
import { HttpModule } from '@nestjs/axios';
import { AppGateway } from './app.gateway';
import { AwsModule } from './aws/aws.module';
import { ScheduleModule } from '@nestjs/schedule';
import { PixelModule } from './pixel/pixel.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.get<string>('DATABASE_URL');
        if (databaseUrl) {
          console.log(
            '[DB] DATABASE_URL 사용 (마스킹):',
            databaseUrl.replace(/\/\/.*@/, '//***@')
          );
        }

        if (databaseUrl) {
          // 프로덕션: DATABASE_URL 사용
          return {
            type: 'postgres',
            url: databaseUrl,
            autoLoadEntities: true,
            entities: [User, Canvas, UserCanvas, Pixel, Group, GroupUser],
            synchronize: false, // 프로덕션에서는 false
            ssl:
              process.env.NODE_ENV === 'production'
                ? { rejectUnauthorized: false }
                : false,
          };
        } else {
          // 로컬 개발: 기존 설정 사용
          return {
            type: 'postgres',
            host: configService.get<string>('POSTGRES_HOST'),
            port: parseInt(
              configService.get<string>('POSTGRES_PORT') || '5432',
              10
            ),
            username: configService.get<string>('POSTGRES_USER'),
            password: configService.get<string>('POSTGRES_PASSWORD'),
            database: configService.get<string>('POSTGRES_DB'),
            autoLoadEntities: true,
            entities: [User, Canvas, UserCanvas, Pixel, Group, GroupUser],
            synchronize: false, // 개발에서도 false로 설정
          };
        }
      },
      inject: [ConfigService],
    }),
    ScheduleModule.forRoot(),
    RedisModule,
    CanvasModule,
    DatabaseModule,
    UserModule,
    AuthModule,
    GroupModule,
    HttpModule,
    AwsModule,
    PixelModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Gateway 초기화 순서 보장
    {
      provide: 'GATEWAY_INITIALIZATION',
      useFactory: async (appGateway: AppGateway) => {
        console.log('[AppModule] Gateway 초기화 순서 보장');
        return appGateway;
      },
      inject: [AppGateway],
    },
    AppGateway,
  ],
})
export class AppModule {}
