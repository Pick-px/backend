import { Module, forwardRef } from '@nestjs/common';
import { GameLogicService } from './game-logic.service';
import { GameStateService } from './game-state.service';
import { GamePixelService } from './game-pixel.service';
import { GameFlushService } from './game-flush.service';
import { GameController } from './game.controller';
import { GameService } from './game.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameUserResult } from './entity/game_result.entity';
import { Question } from 'src/entity/questions.entity';
import { QuestionUser } from './entity/question_user.entity';
import { AuthModule } from '../auth/auth.module';
import { CanvasModule } from '../canvas/canvas.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => CanvasModule),
    TypeOrmModule.forFeature([GameUserResult, Question, QuestionUser]),
    DatabaseModule,
  ],
  providers: [
    GameLogicService, 
    GameStateService, 
    GamePixelService, 
    GameFlushService,
    GameService
  ],
  controllers: [GameController],
  exports: [
    GameLogicService, 
    GameStateService, 
    GamePixelService, 
    GameFlushService,
    GameService
  ],
})
export class GameModule {}
