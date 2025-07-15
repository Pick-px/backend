import {
  Controller,
  Get,
  UseGuards,
  Query,
  Req,
  Post,
  Body,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WaitingResponseDto, QuestionDto } from './dto/waitingResponse.dto';
import { GameService } from './game.service';
import { generatorColor } from '../util/colorGenerator.util';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { AuthRequest } from '../interface/AuthRequest.interface';
import { UploadQuestionDto } from './dto/uploadQuestion.dto';

interface UploadRequet {
  questions: UploadQuestionDto[];
}

@ApiTags('canvas')
@Controller('api/game')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @Get('waitingroom')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async waitingGame(
    @Req() req: AuthRequest,
    @Query('canvasId') canvasId: string
  ) {
    console.log(`[GameController] 대기실 요청: canvasId=${canvasId}`);
    try {
      const user_id = req.user?._id;
      console.log(`[GameController] 유저 정보: userId=${user_id}`);

      const color = generatorColor();
      console.log(`[GameController] 색 생성: color=${color}`);

      const questions: QuestionDto[] = await this.gameService.getQuestions();
      console.log(
        `[GameController] 문제 조회: questions=${questions.length}개`
      );

      const data = await this.gameService.getData(canvasId, color, questions);
      console.log(
        `[GameController] 게임 데이터 조회 완료: canvasId=${canvasId}`
      );

      await this.gameService.setGameReady(color, user_id, canvasId, questions);
      console.log(
        `[GameController] 게임 준비 완료: userId=${user_id}, canvasId=${canvasId}`
      );

      try {
        const resposne = new WaitingResponseDto();
        resposne.data = data;
        resposne.success = true;
        console.log(`[GameController] 응답 생성 완료: success=true`);
        return resposne;
      } catch (err) {
        console.error(`[GameController] 응답 생성 실패:`, err);
        const res = new WaitingResponseDto();
        res.success = false;
        return res;
      }
    } catch (Err) {
      console.error(
        `[GameController] 대기실 요청 처리 실패: canvasId=${canvasId}`,
        Err
      );
      throw Err;
    }
  }

  @Post('upload/question')
  async uploadQuestions(@Body() data: UploadRequet) {
    try {
      await this.gameService.uploadQuestions(data.questions);
      return { success: true };
    } catch (err) {
      console.error(`[GameController] 문제 업로드 실패:`, err);
      return { success: false };
    }
  }
}
