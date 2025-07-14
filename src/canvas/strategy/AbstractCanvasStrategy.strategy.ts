// abstractCanvasStrategy.ts
import { Canvas } from '../entity/canvas.entity';
import { PixelService } from '../../pixel/pixel.service';
import { GroupService } from '../../group/group.service';
import { CanvasService } from '../canvas.service';
import { historyQueue, startQueue } from '../../queues/bullmq.queue';

export abstract class AbstractCanvasStrategy {
  constructor(
    protected readonly pixelService: PixelService,
    private readonly canvasService: CanvasService,
    protected readonly groupService: GroupService
  ) {}

  protected async runPostCreationSteps(canvas: Canvas): Promise<void> {
    await this.pixelService.generatePixel(canvas);
    const defaultGroup = await this.groupService.generateDefaultGruop(canvas);
    await this.groupService.setGroupMadeBy(defaultGroup, 1, canvas.id);
    await this.canvasService.generateCanvasHistory(canvas);
  }

  async isEndingWithOneDay(canvas: Canvas) {
    const now = Date.now();
    const endedAtTime = new Date(canvas.endedAt).getTime();
    const delay = endedAtTime - now;

    // 1일 이내 종료되는 경우 → 큐에 바로 등록
    const ONE_DAYS = 1000 * 60 * 60 * 24 * 1;
    const jobId = `history-${canvas.id}`;

    if (delay > 0 && delay <= ONE_DAYS) {
      await historyQueue.add(
        'canvas-history',
        {
          canvas_id: canvas.id,
          size_x: canvas.sizeX,
          size_y: canvas.sizeY,
          type: canvas.type,
        },
        { jobId: jobId, delay }
      );
    }
  }

  async putJobOnStartQueue(canvas: Canvas) {
    const now = Date.now();
    const startTime = new Date(canvas.startedAt).getTime();
    const delay = startTime - now - 30 * 1000;
    const startId = `start-${canvas.id}`;

    if (startQueue) {
      try {
        await startQueue.add(
          'canvas-start',
          {
            canvas_id: canvas.id,
            title: canvas.title,
            startedAt: canvas.startedAt,
          },
          {
            jobId: startId,
            delay,
          }
        );
      } catch (err) {
        console.error('startQueue.add 중 오류 발생:', err);
      }
    }
  }
}
