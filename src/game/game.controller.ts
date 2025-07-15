import {
  Controller,
  Get,
  InternalServerErrorException,
  UseGuards,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WaitingResponseDto, QuestionDto } from './dto/waitingResponse.dto';
import { GameService } from './game.service';
import { generatorColor } from '../util/colorGenerator.util';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { AuthRequest } from '../interface/AuthRequest.interface';

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
    try {
      const user_id = req.user?._id;
      const color = generatorColor();
      const questions: QuestionDto[] = await this.gameService.getQuestions();
      const data = await this.gameService.getData(canvasId, color, questions);
      await this.gameService.setGameReady(color, user_id, canvasId, questions);
      try {
        const resposne = new WaitingResponseDto();
        resposne.data = data;
        resposne.success = true;
        return resposne;
      } catch (err) {
        console.log(err);
        const res = new WaitingResponseDto();
        res.success = false;
        return res;
      }
    } catch (Err) {
      console.log(Err);
      throw Err;
    }
  }
}
