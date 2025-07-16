import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Question } from './entity/questions.entity';
import { GameUserResult } from '../game/entity/game_result.entity';
import { QuestionUser } from './entity/question_user.entity';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { QuestionDto, GameResponseData, Size } from './dto/waitingResponse.dto';
import { CanvasService } from '../canvas/canvas.service';
import { UploadQuestionDto } from './dto/uploadQuestion.dto';
import { generatorColor } from '../util/colorGenerator.util';
import { GameStateService } from './game-state.service';

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
    private readonly gameStateService: GameStateService,
    @InjectDataSource()
    private readonly dataSource: DataSource
  ) {}

  async getQuestions(): Promise<QuestionDto[]> {
    const questions: QuestionDto[] = await this.dataSource.query(
      'select id, question, options, answer from questions order by RANDOM()'
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
    user_id: number,
    canvasId: string,
    questions: QuestionDto[]
  ): Promise<string> {
    console.log(
      `[GameService] 게임 준비 시작: userId=${user_id}, canvasId=${canvasId}, questions=${questions.length}개`
    );
    
    // 1. Redis에서 기존 색상 확인
    let color = await this.gameStateService.getUserColor(canvasId, String(user_id));
    
    if (!color) {
      // 2. Redis에 없으면 DB에서 확인
      const existingResult = await this.dataSource.query(
        'SELECT assigned_color FROM game_user_result WHERE user_id = $1 AND canvas_id = $2',
        [user_id, canvasId]
      );
      
      if (existingResult.length > 0) {
        // 3. DB에 있으면 Redis에 캐싱
        color = existingResult[0].assigned_color;
        await this.gameStateService.setUserColor(canvasId, String(user_id), color);
        console.log(`[GameService] DB 색상 Redis 캐싱: userId=${user_id}, color=${color}`);
      } else {
        // 4. DB에도 없으면 새로 생성
        color = generatorColor(user_id, canvasId, 1000);
        console.log(`[GameService] 새 색상 생성: userId=${user_id}, color=${color}`);
      }
    } else {
      console.log(`[GameService] Redis 색상 사용: userId=${user_id}, color=${color}`);
    }
    
    try {
      await this.dataSource.transaction(async (manager) => {
        // 기존 game_user_result가 있는지 확인
        const existingResult = await manager.query(
          'SELECT id FROM game_user_result WHERE user_id = $1 AND canvas_id = $2',
          [user_id, canvasId]
        );

        if (existingResult.length === 0) {
          // 새로운 유저: game_user_result 삽입
          await manager.query(
            `INSERT INTO game_user_result (user_id, canvas_id, assigned_color, rank, life, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [user_id, canvasId, color, 0, 2]
          );
          console.log(
            `[GameService] game_user_result 새로 생성: user_id=${user_id}, canvas_id=${canvasId}, color=${color}`
          );
        } else {
          console.log(
            `[GameService] game_user_result 이미 존재: user_id=${user_id}, canvas_id=${canvasId}`
          );
        }

        console.log(
          `[GameService] question_user 저장 시작: userId=${user_id}, questions=${questions.length}개`
        );
        await manager
          .createQueryBuilder()
          .insert()
          .into(QuestionUser)
          .values(
            questions.map((question) => ({
              userId: user_id,
              canvasId: Number(canvasId),
              questionId: question.id,
              isCorrect: true,
            }))
          )
          .execute();
        console.log(`[GameService] question_user 저장 완료: userId=${user_id}`);
      });
      console.log(
        `[GameService] 게임 준비 완료: userId=${user_id}, canvasId=${canvasId}, color=${color}`
      );
      return color;
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

  async uploadQuestions(questions: UploadQuestionDto[]) {
    try {
      await this.questionRepository
        .createQueryBuilder()
        .insert()
        .into(Question)
        .values(
          questions.map((question) => ({
            id: Number(question.id),
            question: question.question,
            options: question.options,
            answer: question.answer,
          }))
        )
        .execute();
      console.log(
        `[GameService] 문제 업로드 완료: questions=${questions.length}개`
      );
    } catch (err) {
      console.error(`[GameService] 문제 업로드 실패:`, err);
      throw new InternalServerErrorException(
        '문제 업로드 중 오류가 발생했습니다.'
      );
    }
  }
}
