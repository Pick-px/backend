// abstractCanvasStrategy.ts
import { Canvas } from '../entity/canvas.entity';
import { PixelService } from '../../pixel/pixel.service';
import { GroupService } from '../../group/group.service';
import { CanvasService } from '../canvas.service';

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
}
