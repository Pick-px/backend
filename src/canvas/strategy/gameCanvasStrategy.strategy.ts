import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { CanvasCreationStrategy } from '../interface/canvasCreateStrategy.interface';
import { createCanvasDto } from '../dto/create_canvas_dto.dto';
import { Canvas } from '../entity/canvas.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AbstractCanvasStrategy } from './AbstractCanvasStrategy.strategy';
import { PixelService } from '../../pixel/pixel.service';
import { GroupService } from '../../group/group.service';
import { CanvasService } from '../canvas.service';

@Injectable()
export class GameCanvasStrategy
  extends AbstractCanvasStrategy
  implements CanvasCreationStrategy
{
  constructor(
    @InjectRepository(Canvas)
    private readonly canvasRepository: Repository<Canvas>,
    pixelService: PixelService,
    @Inject(forwardRef(() => CanvasService))
    canvasService: CanvasService,
    groupService: GroupService
  ) {
    super(pixelService, canvasService, groupService);
  }
  async create(createCanvasDto: createCanvasDto): Promise<Canvas> {
    const { title, size_x, size_y, startedAt, endedAt } = createCanvasDto;
    const canvas = this.canvasRepository.create({
      title,
      type: 'game',
      sizeX: size_x,
      sizeY: size_y,
      createdAt: new Date(),
      startedAt,
      endedAt,
    });
    const newCanvas = await this.canvasRepository.save(canvas);
    await this.runPostCreationSteps(newCanvas);
    await this.isEndingWithOneDay(newCanvas);
    await this.putJobOnStartQueue(newCanvas);
    return newCanvas;
  }
}
