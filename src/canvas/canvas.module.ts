import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Canvas } from './entity/canvas.entity';
import { Pixel } from '../pixel/entity/pixel.entity';
import { CanvasService } from './canvas.service';
import { CanvasController } from './canvas.controller';
import { CanvasGateway } from './canvas.gateway';
import { Group } from '../group/entity/group.entity'; // 추가
import { ImageHistory } from './entity/imageHistory.entity';
import { UserCanvas } from '../entity/UserCanvas.entity';
import { CanvasHistory } from './entity/canvasHistory.entity';
import { User } from '../user/entity/user.entity';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { BullModule } from '@nestjs/bull';
import { redisConnection } from '../queues/bullmq.config';
import { GroupModule } from '../group/group.module';
import { PixelModule } from '../pixel/pixel.module';
import { CanvasStrategyFactory } from './strategy/createFactory.factory';
import { CanvasHistoryService } from './canvas-history.service';
import { GalleryController } from './gallery.controller';
import { UserModule } from '../user/user.module';
import { GameModule } from '../game/game.module';
import { PublicCanvasStrategy } from './strategy/publicCanvasStrategy.strategy';
import { GameCalculationCanvasStrategy } from './strategy/gameCalculationCanvasStrategy.strategy';
import { EventCommonCanvasStrategy } from './strategy/eventCommonCanvasStrategy.strategy';
import { EventColorLimitCanvasStrategy } from './strategy/eventColorLimitCanvasStrategy.strategy';

@Module({
  imports: [
    forwardRef(() => CanvasModule),
    forwardRef(() => UserModule),
    TypeOrmModule.forFeature([
      User,
      Canvas,
      Pixel,
      Group,
      UserCanvas,
      ImageHistory,
      CanvasHistory,
    ]),
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
    forwardRef(() => GameModule), // GameModule 추가
  ],
  controllers: [CanvasController, GalleryController],
  providers: [
    CanvasService,
    CanvasGateway,
    CanvasStrategyFactory,
    PublicCanvasStrategy,
    GameCalculationCanvasStrategy,
    EventCommonCanvasStrategy,
    EventColorLimitCanvasStrategy,
    CanvasHistoryService,
  ],
  exports: [CanvasService, BullModule, CanvasHistoryService],
})
export class CanvasModule {}
