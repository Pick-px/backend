import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Question } from '../entity/questions.entity';
import { GameUserResult } from '../game/entity/game_result.entity';
import { QuestionUser } from './entity/question_user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { QuestionDto, GameResponseData, Size } from './dto/waitingResponse.dto';
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
      'select id, content, answer from questions order by RANDOM()'
    );
    return questions;
  }

  async getData(
    canvasId: string,
    color: string,
    questions: QuestionDto[]
  ): Promise<GameResponseData> {
    const result = await this.canvasService.isActiveGameCanvas(
      Number(canvasId)
    );
    if (!result) throw new NotFoundException('캔버스 활성상태가 아닙니다.');
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
    res.canvasSize = new Size();
    res.canvasSize.width = canvas.metaData?.sizeX;
    res.canvasSize.height = canvas.metaData?.sizeY;
    return res;
  }

  async setGameReady(
    color: string,
    user_id: number,
    canvasId: string,
    questions: QuestionDto[]
  ): Promise<void> {
    console.log(
      `[GameService] 게임 준비 시작: userId=${user_id}, canvasId=${canvasId}, color=${color}, questions=${questions.length}개`
    );
    try {
      await this.dataSource.transaction(async (manager) => {
        try {
          await manager.save(GameUserResult, {
            user: { id: user_id },
            canvas: { id: Number(canvasId) },
            rank: 0,
            color: color,
            createdAt: new Date(),
          });
          console.log(
            `[GameService] game_user_result 저장 성공: user_id=${user_id}, canvas_id=${canvasId}, color=${color}`
          );
        } catch (err) {
          console.error(
            `[GameService] game_user_result 저장 실패: user_id=${user_id}, canvas_id=${canvasId}, color=${color}, 에러=${err.message}`
          );
          // 직접 쿼리로도 시도
          await manager.query(
            `INSERT INTO game_user_result (user_id, canvas_id, assigned_color, rank, life, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (user_id, canvas_id) DO NOTHING`,
            [user_id, canvasId, color, 0, 2]
          );
          console.log(
            `[GameService] game_user_result 직접 쿼리로 저장 시도: user_id=${user_id}, canvas_id=${canvasId}, color=${color}`
          );
        }
        console.log(
          `[GameService] game_user_result 저장 시도 완료: user_id=${user_id}, canvas_id=${canvasId}, color=${color}`
        );

        console.log(
          `[GameService] question_user 저장 시작: userId=${user_id}, questions=${questions.length}개`
        );
        await manager
          .createQueryBuilder()
          .insert()
          .into(QuestionUser)
          .values(
            questions.map((question) => ({
              user: { id: user_id },
              canvas: { id: Number(canvasId) },
              question_id: { id: question.id },
              isCorrect: true,
            }))
          )
          .execute();
        console.log(`[GameService] question_user 저장 완료: userId=${user_id}`);
      });
      console.log(
        `[GameService] 게임 준비 완료: userId=${user_id}, canvasId=${canvasId}`
      );
    } catch (err) {
      console.error(
        `[GameService] 게임 준비 실패: userId=${user_id}, canvasId=${canvasId}`,
        err
      );
      throw new InternalServerErrorException(
        '게임 준비 중 오류가 발생했습니다.'
      );
    }
  }
}
