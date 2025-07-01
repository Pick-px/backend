import { Body, Controller, Post, Query, Get } from '@nestjs/common';
import { CanvasService } from './canvas.service';
import { createCanvasDto } from './dto/create_canvas_dto.dto';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';

@ApiTags('api/canvas')
@Controller('api/canvas')
export class CanvasController {
  constructor(private readonly canvasService: CanvasService) {}

  @ApiOperation({ summary: 'Create Canvas' })
  @ApiOkResponse({ description: '캔버스 만들기 성공' })
  @ApiBadRequestResponse({ description: '' })
  @Post()
  async create(@Body() createCanvasDto: createCanvasDto) {
    try {
      await this.canvasService.createCanvas(createCanvasDto);
      console.log('캔버스 만들기 성공');
    } catch (err) {
      console.error(err);
    }
  }

  @ApiTags('pixels')
  @ApiOperation({
    summary: '특정 캔버스의 모든 픽셀 데이터 조회',
    description:
      'canvas_id로 해당 캔버스의 전체 픽셀 데이터를 압축하여 반환합니다.',
  })
  @ApiQuery({
    name: 'canvas_id',
    required: true,
    description: '조회할 캔버스 ID',
  })
  @ApiResponse({
    status: 200,
    description: '픽셀 데이터 및 메타 정보 반환',
    schema: {
      example: {
        success: true,
        data: {
          pixels: [
            { x: 100, y: 200, color: '#ff0000' },
            { x: 101, y: 201, color: '#00ff00' },
          ],
          compression: 'gzip',
          totalPixels: 5000,
          canvasSize: {
            width: 1000,
            height: 1000,
          },
        },
      },
    },
  })
  @Get('pixels')
  async getAllPixels(@Query('canvas_id') canvas_id?: string) {
    // 픽셀 데이터 조회 (서비스에서 canvas_id 없으면 디폴트로 처리)
    const pixels = await this.canvasService.getAllPixels(canvas_id);

    // 실제 캔버스 정보 조회 (서비스에서 canvas_id 없으면 디폴트로 처리)
    const canvas = await this.canvasService.getCanvasById(canvas_id);
    if (!canvas?.metaData) throw new Error('캔버스가 없습니다.');

    const id = canvas.canvas_id;
    const meta = canvas.metaData;
    return {
      success: true,
      data: {
        canvas_id: id,
        pixels,
        compression: 'gzip',
        totalPixels: pixels.length,
        canvasSize: {
          width: meta.sizeX ?? 0,
          height: meta.sizeY ?? 0,
        },
      },
    };
  }

  @Get('default')
  async getDefaultCanvas() {
    const canvas = await this.canvasService.getCanvasById(); // 파라미터 없이 호출 시 디폴트 반환
    const defaultCanvas = canvas?.canvas_id;
    if (!defaultCanvas) {
      throw new Error('아이디 없음');
    }
    return { id: defaultCanvas };
  }

  @Get()
  async getCanvas(@Query('canvas_id') canvas_id?: string) {
    try {
      let canvas = await this.canvasService.getCanvasById(canvas_id);
      if (!canvas) {
        // 디폴트 캔버스 조회
        canvas = await this.canvasService.getCanvasById();
        if (!canvas?.metaData) {
          return { success: false, message: '캔버스가 없습니다.' };
        }
      }
      const canvasMetaData = canvas.metaData;

      if (!canvasMetaData) throw new Error('캔버스 정보 없음');
      if (!canvas.canvas_id) throw new Error('캔버스 Id ');
      return {
        success: true,
        data: {
          id: canvas.canvas_id,
          title: canvasMetaData.title,
          type: canvasMetaData.type,
          createdAt: canvasMetaData.createdAt,
          endedAt: canvasMetaData.endedAt,
          sizeX: canvasMetaData.sizeX,
          sizeY: canvasMetaData.sizeY,
        },
      };
    } catch (err) {
      console.error('캔버스 조회 중 에러:', err);
      return {
        success: false,
        message: 'Internal server error',
        error: err?.message,
      };
    }
  }
}
