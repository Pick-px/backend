import { Module, forwardRef } from '@nestjs/common';
import { GameLogicService } from './game-logic.service';
import { GameStateService } from './game-state.service';
import { GamePixelService } from './game-pixel.service';
import { GameController } from './game.controller';
import { GameService } from './game.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameUserResult } from './entity/game_result.entity';
import { Question } from 'src/game/entity/questions.entity';
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
    GameService,
  ],
  controllers: [GameController],
  exports: [
    GameLogicService,
    GameStateService,
    GamePixelService,
    GameService,
  ],
})
export class GameModule {}
