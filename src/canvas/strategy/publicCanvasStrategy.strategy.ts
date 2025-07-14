import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CanvasCreationStrategy } from '../interface/canvasCreateStrategy.interface';
import { Repository } from 'typeorm';
import { Canvas } from '../entity/canvas.entity';
import { GroupService } from '../../group/group.service';
import { PixelService } from '../../pixel/pixel.service';
import { createCanvasDto } from '../dto/create_canvas_dto.dto';
import { AbstractCanvasStrategy } from './AbstractCanvasStrategy.strategy';
import { CanvasService } from '../canvas.service';
@Injectable()
export class PublicCanvasStrategy
  extends AbstractCanvasStrategy
  implements CanvasCreationStrategy
{
  constructor(
    @InjectRepository(Canvas)
    private readonly canvasRepository: Repository<Canvas>,
    groupService: GroupService,
    @Inject(forwardRef(() => CanvasService))
    canvasService: CanvasService,
    pixelService: PixelService
  ) {
    super(pixelService, canvasService, groupService);
  }

  async create(createCanvasDto: createCanvasDto): Promise<Canvas> {
    const { title, size_x, size_y, startedAt } = createCanvasDto;
    const canvas = this.canvasRepository.create({
      title,
      type: 'public',
      sizeX: size_x,
      sizeY: size_y,
      createdAt: new Date(),
      startedAt,
    });
    const newCanvas = await this.canvasRepository.save(canvas);
    await this.runPostCreationSteps(newCanvas);
    return newCanvas;
  }
}
