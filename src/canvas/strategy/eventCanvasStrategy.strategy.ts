import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Canvas } from '../entity/canvas.entity';
import { GroupService } from '../../group/group.service';
import { Repository } from 'typeorm';
import { CanvasCreationStrategy } from '../interface/canvasCreateStrategy.interface';
import { createCanvasDto } from '../dto/create_canvas_dto.dto';
import { PixelService } from '../../pixel/pixel.service';
import { AbstractCanvasStrategy } from './AbstractCanvasStrategy.strategy';

@Injectable()
export class EventCanvasStrategy
  extends AbstractCanvasStrategy
  implements CanvasCreationStrategy
{
  constructor(
    @InjectRepository(Canvas)
    private readonly canvasRepository: Repository<Canvas>,
    groupService: GroupService,
    pixelService: PixelService
  ) {
    super(pixelService, groupService);
  }

  async create(dto: createCanvasDto): Promise<Canvas> {
    const { title, size_x, size_y, startedAt, endedAt } = dto;

    const canvas = this.canvasRepository.create({
      title,
      type: 'event',
      sizeX: size_x,
      sizeY: size_y,
      createdAt: new Date(),
      startedAt,
      endedAt,
    });
    const newCanvas = await this.canvasRepository.save(canvas);
    await this.runPostCreationSteps(newCanvas);
    await this.isEndingWithOneDay(newCanvas);
    return newCanvas;
  }
}
