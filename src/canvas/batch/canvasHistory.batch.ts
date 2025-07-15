import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Canvas } from '../entity/canvas.entity';
import { CanvasService } from '../canvas.service';
import {
  isEndingWithOneDay,
  putJobOnAlarmQueue3SecsBeforeStart,
  putJobOnAlarmQueueBeforeStart30s,
  putJobOnAlarmQueueThreeSecBeforeEnd,
} from 'src/util/alarmGenerator.util';

@Injectable()
export class CanvasHistoryBatch {
  constructor(private readonly canvasService: CanvasService) {}

  @Cron('0 0 * * *') // 매일 자정에 실행
  async handleCanvasHistoryBatch() {
    const canvases: Canvas[] =
      await this.canvasService.findCanvasesEndingWithinDays(1);
    for (const canvas of canvases) {
      await isEndingWithOneDay(canvas);
      if (canvas.type.startsWith('game_')) {
        await putJobOnAlarmQueue3SecsBeforeStart(canvas);
        await putJobOnAlarmQueueBeforeStart30s(canvas);
        await putJobOnAlarmQueueThreeSecBeforeEnd(canvas);
      }
    }
  }
}
