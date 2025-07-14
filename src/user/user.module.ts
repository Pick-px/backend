import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entity/user.entity';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { HttpModule } from '@nestjs/axios';
import { AuthModule } from '../auth/auth.module';
import { QuestionUser } from '../game/entity/question_user.entity';
import { CanvasHistory } from '../canvas/entity/canvasHistory.entity';
import { CanvasModule } from '../canvas/canvas.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([User, CanvasHistory, QuestionUser]),
    HttpModule,
    forwardRef(() => AuthModule),
    forwardRef(() => CanvasModule),
  ],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
