import { Body, Controller, Post } from '@nestjs/common';
import { CanvasService } from './canvas.service';
import { createCanvasDto } from './dto/create_canvas_dto.dto';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';

@ApiTags('canvas')
@Controller('canvas')
export class CanvasController {
  constructor(private readonly canvasService: CanvasService) {}

  @ApiOperation({ summary: 'Create Canvas' })
  @ApiOkResponse({ description: '캔버스 만들기 성공' })
  @ApiBadRequestResponse({ description: '' })
  @Post()
  async create(@Body() createCanvasDto: createCanvasDto) {
    try {
      //await this.canvasService.createCanvas(createCanvasDto);
    } catch (err) {
      console.error(err);
    }
  }
}
