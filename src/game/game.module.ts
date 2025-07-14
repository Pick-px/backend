import { Module, forwardRef } from '@nestjs/common';
import { GameLogicService } from './game-logic.service';
import { GameStateService } from './game-state.service';
import { GamePixelService } from './game-pixel.service';
import { GameFlushService } from './game-flush.service';
import { CanvasModule } from '../canvas/canvas.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [
    forwardRef(() => CanvasModule),
    DatabaseModule,
  ],
  providers: [GameLogicService, GameStateService, GamePixelService, GameFlushService],
  exports: [GameLogicService, GameStateService, GamePixelService, GameFlushService],
})
export class GameModule {} 