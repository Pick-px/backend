import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Canvas } from './entity/canvas.entity';
import { Pixel } from '../pixel/entity/pixel.entity';
import { CanvasService } from './canvas.service';
import { CanvasController } from './canvas.controller';
import { CanvasGateway } from './canvas.gateway';
import { Group } from '../group/entity/group.entity'; // 추가
import { UserCanvas } from '../entity/UserCanvas.entity';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { BullModule } from '@nestjs/bull';
import { redisConnection } from '../queues/bullmq.config';
import { GroupModule } from '../group/group.module';
import { PixelModule } from '../pixel/pixel.module';
import { CanvasStrategyFactory } from './strategy/createFactory.factory';
import { PublicCanvasStrategy } from './strategy/publicCanvasStrategy.strategy';
import { EventCanvasStrategy } from './strategy/eventCanvasStrategy.strategy';
import { GameCanvasStrategy } from './strategy/gameCanvasStrategy.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([Canvas, Pixel, Group, UserCanvas]),
    JwtModule.register({}),
    AuthModule,
    BullModule.registerQueueAsync({
      name: 'canvas-history',
      useFactory: () => ({
        name: 'canvas-history',
        connection: redisConnection,
      }),
    }),
    GroupModule,
    PixelModule,
  ],
  controllers: [CanvasController],
  providers: [
    CanvasService,
    CanvasGateway,
    CanvasStrategyFactory,
    PublicCanvasStrategy,
    GameCanvasStrategy,
    EventCanvasStrategy,
  ],
  exports: [CanvasService, BullModule],
})
export class CanvasModule {}
