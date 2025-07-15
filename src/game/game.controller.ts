import {
  Controller,
  Get,
  InternalServerErrorException,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WaitingResponseDto } from './dto/waitingResponse.dto';
import { GameService } from './game.service';
import { generatorColor } from '../util/colorGenerator.util';
import { JwtAuthGuard } from '../auth/jwt.guard';

@ApiTags('canvas')
@Controller('api/game')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @Get('waitingroom')
  @UseGuards(JwtAuthGuard)
  async waitingGame(@Query('canvasId') canvasId: string) {
    try {
      const color = generatorColor();
      const data = await this.gameService.getData(canvasId, color);
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
      throw new InternalServerErrorException(
        '문제 조회 및 색상 배정 중 서버 오류 발생'
      );
    }
  }
}
