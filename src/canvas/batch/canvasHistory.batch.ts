import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Canvas } from '../entity/canvas.entity';
import { CanvasService } from '../canvas.service';

@Injectable()
export class CanvasHistoryBatch {
  constructor(
    private readonly canvasService: CanvasService,
    @InjectQueue('canvas-history') private readonly historyQueue: Queue
  ) {}

  @Cron('0 0 * * *') // 매일 자정에 실행
  async handleCanvasHistoryBatch() {
    const canvases: Canvas[] =
      await this.canvasService.findCanvasesEndingWithinDays(3);
    for (const canvas of canvases) {
      const jobId = `${canvas.id}`;
      const now = Date.now();
      const endedAtTime = new Date(canvas.endedAt).getTime();
      const delay = endedAtTime - now;
      await this.historyQueue.add(
        'generate-history',
        { canvas_id: canvas.id },
        {
          jobId,
          delay,
        }
      );
    }
  }
}
