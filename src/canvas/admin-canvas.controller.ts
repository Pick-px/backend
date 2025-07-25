import { Controller, Get, Post, Delete, Body, UseGuards, Req, HttpCode, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { AdminGuard } from '../auth/admin.guard';
import { CanvasService } from './canvas.service';
import { CanvasGateway } from './canvas.gateway';
// import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiResponse } from '@nestjs/swagger';
import { GameLogicService } from '../game/game-logic.service';

// @ApiTags('admin/canvas')
// @ApiBearerAuth()
@Controller('api/admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminCanvasController {
  constructor(
    private readonly canvasService: CanvasService,
    private readonly canvasGateway: CanvasGateway,
    private readonly gameLogicService: GameLogicService,
  ) {}

  @Get('canvas/list')
  // @ApiOperation({ summary: '전체 캔버스 리스트 조회', description: '관리자 권한으로 전체 캔버스 리스트를 조회합니다.' })
  // @ApiResponse({ status: 200, description: '캔버스 리스트', schema: { example: [ { id: 1, title: '캔버스 제목', type: 'public', created_at: '2024-06-01T12:00:00Z', started_at: '2024-06-01T12:00:00Z', ended_at: null, size_x: 100, size_y: 100 } ] } })
  async getCanvasList() {
    const result = await this.canvasService.getCanvasList('all');
    return result;
  }

  @Post('canvas')
  @HttpCode(201)
  // @ApiOperation({ summary: '캔버스 생성', description: '관리자 권한으로 새 캔버스를 생성합니다.' })
  // @ApiBody({ schema: { example: { title: '캔버스 제목', type: 'public', size_x: 100, size_y: 100, started_at: '2025-07-18T19:21:17Z', ended_at: '2025-07-18T19:24:17Z' } } })
  // @ApiResponse({ status: 201, description: '생성된 캔버스 정보', schema: { example: { id: 1, title: '캔버스 제목', type: 'public', created_at: '2024-06-01T12:00:00Z', started_at: '2024-06-01T12:00:00Z', ended_at: null, size_x: 100, size_y: 100 } } })
  async createCanvas(@Body() body) {
    const dto = {
      title: body.title,
      type: body.type,
      size_x: body.size_x ?? body.sizeX,
      size_y: body.size_y ?? body.sizeY,
      startedAt: body.started_at ? new Date(body.started_at) : new Date(),
      endedAt: body.ended_at ? new Date(body.ended_at) : null,
    };
    const canvas = await this.canvasService.createCanvas(dto as any);
    if (!canvas) throw new BadRequestException('캔버스 생성 실패');
    return {
      id: canvas.id,
      title: canvas.title,
      type: canvas.type,
      created_at: canvas.createdAt,
      started_at: canvas.startedAt,
      ended_at: canvas.endedAt,
      size_x: canvas.sizeX,
      size_y: canvas.sizeY,
    };
  }

  @Delete('canvas')
  // @ApiOperation({ summary: '캔버스 삭제', description: '관리자 권한으로 캔버스 및 연관 데이터를 하드 딜리트합니다.' })
  // @ApiBody({ schema: { example: { canvasId: 1 } } })
  // @ApiResponse({ status: 200, description: '삭제 성공', schema: { example: { success: true, message: '캔버스 및 연관 데이터가 삭제되었습니다.' } } })
  async deleteCanvas(@Body() body) {
    const canvasId = body.canvasId;
    if (!canvasId) throw new BadRequestException('canvasId 필요');
    const result = await this.canvasService.deleteCanvasById(canvasId);
    if (!result) throw new NotFoundException('캔버스 삭제 실패');
    this.canvasGateway.server.to(`canvas_${canvasId}`).emit('pixel_error', {
      type: 'deleted',
      message: '관리자에 의해 삭제된 캔버스입니다.',
    });
    return { success: true, message: '캔버스 및 연관 데이터가 삭제되었습니다.' };
  }

  @Post('force_end')
  // @ApiOperation({ summary: '게임 캔버스 강제 종료', description: '관리자 권한으로 게임 캔버스를 강제 종료합니다.' })
  // @ApiBody({ schema: { example: { canvasId: 1 } } })
  // @ApiResponse({ status: 200, description: '강제 종료 성공', schema: { example: { success: true, message: '게임 캔버스가 강제 종료되었습니다.' } } })
  async forceEndCanvas(@Body() body) {
    const canvasId = body.canvasId;
    if (!canvasId) throw new BadRequestException('canvasId 필요');
    // ended_at을 현재로 업데이트
    const result = await this.canvasService.forceEndCanvas(canvasId);
    if (!result) throw new NotFoundException('강제 종료 실패');
    // 소켓 알림
    this.canvasGateway.server.to(`canvas_${canvasId}`).emit('game_error', {
      type: 'force_end',
      message: '게임이 강제 종료되었습니다.',
    });
    // 게임 결과(랭킹) 즉시 계산 및 브로드캐스트
    await this.gameLogicService.forceGameEnd(String(canvasId), this.canvasGateway.server);
    return { success: true, message: '게임 캔버스가 강제 종료되었습니다.' };
  }
} 