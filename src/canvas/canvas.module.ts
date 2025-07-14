import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Canvas } from './entity/canvas.entity';
import { Pixel } from '../pixel/entity/pixel.entity';
import { User } from '../user/entity/user.entity';
import { CanvasService } from './canvas.service';
import { CanvasController } from './canvas.controller';
import { CanvasGateway } from './canvas.gateway';
import { Group } from '../group/entity/group.entity'; // 추가
import { CanvasHistory } from './entity/canvasHistory.entity';
import { ImageHistory } from './entity/imageHistory.entity';
import { UserCanvas } from '../entity/UserCanvas.entity';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { GroupModule } from '../group/group.module';
import { PixelModule } from '../pixel/pixel.module';
import { CanvasStrategyFactory } from './strategy/createFactory.factory';
import { PublicCanvasStrategy } from './strategy/publicCanvasStrategy.strategy';
import { EventCanvasStrategy } from './strategy/eventCanvasStrategy.strategy';
import { GameCanvasStrategy } from './strategy/gameCanvasStrategy.strategy';
import { UserModule } from '../user/user.module';
import { CanvasStartProcessor } from './processor/canvasStart.processor';

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
    CanvasStartProcessor,
  ],
  exports: [CanvasService],
})
export class CanvasModule {}
