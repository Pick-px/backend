import { forwardRef, Module } from '@nestjs/common';
import { GameController } from './game.controller';
import { GameService } from './game.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameUserResult } from './entity/game_result.entity';
import { Question } from 'src/entity/questions.entity';
import { QuestionUser } from './entity/question_user.entity';
import { AuthModule } from '../auth/auth.module';
import { CanvasModule } from '../canvas/canvas.module';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    TypeOrmModule.forFeature([GameUserResult, Question, QuestionUser]),
    CanvasModule,
  ],
  providers: [GameService],
  controllers: [GameController],
  exports: [GameService],
})
export class GameModule {}
