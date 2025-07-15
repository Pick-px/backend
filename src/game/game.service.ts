import { Injectable, NotFoundException } from '@nestjs/common';
import { Question } from '../entity/questions.entity';
import { GameUserResult } from '../game/entity/game_result.entity';
import { QuestionUser } from './entity/question_user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { QuestionDto, GameResponseData } from './dto/waitingResponse.dto';
import { CanvasService } from '../canvas/canvas.service';

@Injectable()
export class GameService {
  constructor(
    @InjectRepository(Question)
    private readonly questionRepository: Repository<Question>,
    @InjectRepository(GameUserResult)
    private readonly gameUserResultRepository: Repository<GameUserResult>,
    @InjectRepository(QuestionUser)
    private readonly questionUserRepository: Repository<QuestionUser>,
    private readonly canvasService: CanvasService,
    private readonly dataSource: DataSource
  ) {}

  async getQuestions(): Promise<QuestionDto[]> {
    const questions: QuestionDto[] = await this.dataSource.query(
      'select id, context, answer from questions order by RANDOM()'
    );
    return questions;
  }

  async getData(canvasId: string, color: string): Promise<GameResponseData> {
    const result = await this.canvasService.isCanvasActive(Number(canvasId));
    if (!result) throw new NotFoundException('캔버스 활성상태가 아닙니다.');
    const questions = await this.getQuestions();
    const canvas = await this.canvasService.getCanvasById(canvasId);
    if (!canvas || !canvas.metaData)
      throw new NotFoundException('캔버스가 존재하지 않습니다.');
    const res = new GameResponseData();
    res.canvas_id = canvas?.canvas_id;
    res.color = color;
    res.startedAt = canvas.metaData?.startedAt;
    res.endedAt = canvas.metaData?.endedAt;
    res.title = canvas.metaData?.title;
    res.type = canvas.metaData?.type;
    res.questions = questions;
    res.canvasSize.width = canvas.metaData?.sizeX;
    res.canvasSize.height = canvas.metaData?.sizeY;
    return res;
  }
}
