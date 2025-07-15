class WaitingResponseDto {
  success: boolean = false;
  data?: GameResponseData;
}

class QuestionDto {
  id: number;
  context: string;
  answer: number;
}

class GameResponseData {
  canvas_id: string;
  title: string;
  type: string;
  startedAt: Date;
  endedAt: Date;
  canvasSize: Size;
  questions: QuestionDto[];
  color: string;
}

class Size {
  width: number;
  height: number;
}
export { WaitingResponseDto, QuestionDto, GameResponseData, Size };
