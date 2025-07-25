import {
  Controller,
  Get,
  UseGuards,
  Query,
  Req,
  Post,
  Body,
} from '@nestjs/common';
// import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WaitingResponseDto, QuestionDto } from './dto/waitingResponse.dto';
import { GameService } from './game.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { AuthRequest } from '../interface/AuthRequest.interface';
import { UploadQuestionDto } from './dto/uploadQuestion.dto';
import { GameStateService } from './game-state.service';
import { CanvasInfo } from '../interface/CanvasInfo.interface';

interface UploadRequet {
  questions: UploadQuestionDto[];
}

// @ApiTags('canvas')
@Controller('api/game')
export class GameController {
  constructor(
    private readonly gameService: GameService,
    private readonly gameStateService: GameStateService
  ) {}

  @Get('waitingroom')
  @UseGuards(JwtAuthGuard)
  // @ApiBearerAuth()
  async waitingGame(
    @Req() req: AuthRequest,
    @Query('canvasId') canvasId: string
  ) {
    try {
      const user_id = req.user?._id;

      const questions: QuestionDto[] = await this.gameService.getQuestions();

      // setGameReady에서 색상 생성 및 반환
      const color = await this.gameService.setGameReady(
        user_id,
        canvasId,
        questions
      );

      const data = await this.gameService.getData(canvasId, color, questions);

      try {
        const resposne = new WaitingResponseDto();
        resposne.data = data;
        resposne.success = true;

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

  @Get('list')
  async getGameList() {
    try {
      const games: CanvasInfo[] = await this.gameService.getGameList();
      return games;
    } catch (err) {
      console.error('Error 발생 : ', err);
      throw err;
    }
  }
}
