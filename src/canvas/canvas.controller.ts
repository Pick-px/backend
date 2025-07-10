import {
  Body,
  Controller,
  Post,
  Query,
  Get,
  Res,
  NotFoundException,
  InternalServerErrorException,
  HttpException,
} from '@nestjs/common';
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
import { Response } from 'express';
import * as zlib from 'zlib';

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
    description: `
      이 API는 gzip으로 압축된 JSON을 반환합니다.
      응답 헤더에 Content-Encoding: gzip이 포함됩니다.
      아래 예시는 압축 해제 후의 JSON 구조입니다.
    `,
    schema: {
      example: {
        success: true,
        data: {
          canvas_id: '1',
          title: '이벤트 캔버스',
          type: 'event',
          startedAt: '2024-07-15T00:00:00.000Z',
          endedAt: '2024-08-01T00:00:00.000Z',
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
  async getAllPixels(
    @Res() res: Response,
    @Query('canvas_id') canvas_id?: string
  ) {
    // 실제 캔버스 정보 조회 (서비스에서 canvas_id 없으면 디폴트로 처리)
    const canvas = await this.canvasService.getCanvasById(canvas_id);
    if (!canvas?.metaData) throw new NotFoundException('캔버스가 없습니다.');

    // 캔버스 활성 상태 체크
    const now = new Date();
    const meta = canvas.metaData;
    
    if (meta.startedAt > now) {
      throw new HttpException(
        { 
          success: false, 
          message: '캔버스가 아직 시작되지 않았습니다.',
          startedAt: meta.startedAt 
        }, 
        403
      );
    }
    
    if (meta.endedAt && meta.endedAt <= now) {
      throw new HttpException(
        { 
          success: false, 
          message: '캔버스가 이미 종료되었습니다.',
          endedAt: meta.endedAt 
        }, 
        403
      );
    }

    // 픽셀 데이터 조회 (서비스에서 canvas_id 없으면 디폴트로 처리)
    const pixels = await this.canvasService.getAllPixels(canvas_id);

    const id = canvas.canvas_id;
    const responseData = {
      success: true,
      data: {
        canvas_id: id,
        title: meta.title,
        type: meta.type,
        startedAt: meta.startedAt,
        endedAt: meta.endedAt,
        pixels,
        compression: 'gzip',
        totalPixels: pixels.length,
        canvasSize: {
          width: meta.sizeX ?? 0,
          height: meta.sizeY ?? 0,
        },
      },
    };

    const json = JSON.stringify(responseData);
    const gzipped = zlib.gzipSync(json);
    res.set({
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip',
    });
    res.send(gzipped);
  }

  @Get('default')
  async getDefaultCanvas() {
    const canvas = await this.canvasService.getCanvasById(); // 파라미터 없이 호출 시 디폴트 반환
    const defaultCanvas = canvas?.canvas_id;
    if (!defaultCanvas) {
      throw new NotFoundException('아이디 없음');
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

      if (!canvasMetaData) throw new NotFoundException('캔버스 정보 없음');
      if (!canvas.canvas_id) throw new NotFoundException('캔버스 Id ');

      // 캔버스 활성 상태 체크
      const now = new Date();
      
      if (canvasMetaData.startedAt > now) {
        return {
          success: false,
          message: '캔버스가 아직 시작되지 않았습니다.',
          startedAt: canvasMetaData.startedAt,
          status: 'not_started'
        };
      }
      
      if (canvasMetaData.endedAt && canvasMetaData.endedAt <= now) {
        return {
          success: false,
          message: '캔버스가 이미 종료되었습니다.',
          endedAt: canvasMetaData.endedAt,
          status: 'ended'
        };
      }

      return {
        success: true,
        data: {
          id: canvas.canvas_id,
          title: canvasMetaData.title,
          type: canvasMetaData.type,
          createdAt: canvasMetaData.createdAt,
          startedAt: canvasMetaData.startedAt,
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
      };
    }
  }

  @ApiOperation({
    summary: '캔버스 리스트',
    description: 'status(active/inactive)에 따른 캔버스 리스트 반환 (active: 종료되지 않은 모든 캔버스, inactive: 종료된 캔버스)',
  })
  @Get('list')
  async getCanvasList(@Query('status') status: string) {
    try {
      const result = await this.canvasService.getCanvasList(status);
      return { canvases: result };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new InternalServerErrorException('서버 오류');
    }
  }
}
