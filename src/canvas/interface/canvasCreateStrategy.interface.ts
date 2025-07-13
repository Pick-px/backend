import { createCanvasDto } from '../dto/create_canvas_dto.dto';
import { Canvas } from '../entity/canvas.entity';

export interface CanvasCreationStrategy {
  create(createCanvasDto: createCanvasDto): Promise<Canvas>;
}
