import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Canvas } from './entity/canvas.entity';
import { Pixel } from '../pixel/entity/pixel.entity';
import { CanvasService } from './canvas.service';
import { CanvasController } from './canvas.controller';
import { CanvasGateway } from './canvas.gateway';
import { Group } from '../group/entity/group.entity'; // 추가
import { UserCanvas } from '../entity/UserCanvas.entity';
import { CanvasHistory } from './entity/canvasHistory.entity';
import { User } from '../user/entity/user.entity';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { GroupModule } from '../group/group.module';
import { PixelModule } from '../pixel/pixel.module';
import { CanvasStrategyFactory } from './strategy/createFactory.factory';
import { CanvasHistoryService } from './canvas-history.service';
import { GalleryController } from './gallery.controller';
import { AdminCanvasController } from '../canvas/admin-canvas.controller';
import { UserModule } from '../user/user.module';
import { GameModule } from '../game/game.module';
import { PublicCanvasStrategy } from './strategy/publicCanvasStrategy.strategy';
import { GameCalculationCanvasStrategy } from './strategy/gameCalculationCanvasStrategy.strategy';
import { EventCommonCanvasStrategy } from './strategy/eventCommonCanvasStrategy.strategy';
import { EventColorLimitCanvasStrategy } from './strategy/eventColorLimitCanvasStrategy.strategy';
import { AwsModule } from '../aws/aws.module';
import { ScheduleModule } from '@nestjs/schedule';
import { CanvasHistoryBatch } from './batch/canvasHistory.batch';
import { BroadcastService } from './broadcast.service';

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
      CanvasHistory,
    ]),
    ScheduleModule.forRoot(),
    JwtModule.register({}),
    AuthModule,
    GroupModule,
    PixelModule,
    forwardRef(() => GameModule), // GameModule 추가
    AwsModule, // AwsModule 추가
  ],
  controllers: [CanvasController, GalleryController, AdminCanvasController],
  providers: [
    CanvasService,
    CanvasGateway,
    CanvasStrategyFactory,
    PublicCanvasStrategy,
    GameCalculationCanvasStrategy,
    EventCommonCanvasStrategy,
    EventColorLimitCanvasStrategy,
    CanvasHistoryService,
    CanvasHistoryBatch,
    BroadcastService,
  ],
  exports: [CanvasService, CanvasHistoryService],
})
export class CanvasModule {}
