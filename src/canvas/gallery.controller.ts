import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
// import { ApiTags, ApiOperation, ApiResponse, ApiProperty } from '@nestjs/swagger';
import { CanvasHistoryService } from './canvas-history.service';

// Swagger DTO 클래스들
class GalleryItemDto {
  // @ApiProperty({ description: '캔버스 이미지 URL', example: 'https://s3.amazonaws.com/bucket/history/1/image.png' })
  image_url: string;

  // @ApiProperty({ description: '캔버스 제목', example: '고양이캔버스' })
  title: string;

  // @ApiProperty({ description: '캔버스 타입', example: 'event', enum: ['event', 'game'] })
  type: string;

  // @ApiProperty({ description: '캔버스 생성 시간', example: '2025-07-20T09:30:00Z' })
  created_at: string;

  // @ApiProperty({ description: '캔버스 종료 시간', example: '2025-07-20T09:30:00Z' })
  ended_at: string;

  // @ApiProperty({ description: '캔버스 가로 크기', example: 200 })
  size_x: number;

  // @ApiProperty({ description: '캔버스 세로 크기', example: 150 })
  size_y: number;

  // @ApiProperty({ description: '참여자 수', example: 10 })
  participant_count: number;

  // @ApiProperty({ description: '전체 색칠 시도 수', example: 1500 })
  total_try_count: number;

  // @ApiProperty({ description: '가장 많이 색칠 시도한 사용자 닉네임', example: 'user123' })
  top_try_user_name: string;

  // @ApiProperty({ description: '가장 많이 색칠 시도한 사용자의 시도 수', example: 45 })
  top_try_user_count: number;

  // @ApiProperty({ description: '가장 많이 픽셀을 소유한 사용자 닉네임', example: 'user456' })
  top_own_user_name: string;

  // @ApiProperty({ description: '가장 많이 픽셀을 소유한 사용자의 소유 수', example: 23 })
  top_own_user_count: number;
}

class GalleryResponseDto {
  // @ApiProperty({ description: '요청 성공 여부', example: true })
  isSuccess: boolean;

  // @ApiProperty({ description: '응답 코드', example: '200' })
  code: string;

  // @ApiProperty({ description: '응답 메시지', example: '요청에 성공하였습니다.' })
  message: string;

  // @ApiProperty({ description: '갤러리 데이터 배열', type: [GalleryItemDto] })
  data: GalleryItemDto[];
}

// @ApiTags('api/gallery')
@Controller('api/gallery')
export class GalleryController {
  constructor(
    private readonly canvasHistoryService: CanvasHistoryService
  ) {}

  @Get()
  // @ApiOperation({ 
  //   summary: '갤러리 데이터 조회',
  //   description: '종료된 이벤트/게임 캔버스의 갤러리 데이터를 조회합니다. 각 캔버스의 통계 정보와 이미지 URL을 포함합니다.'
  // })
  // @ApiResponse({
  //   status: 200,
  //   description: '갤러리 데이터 조회 성공',
  //   type: GalleryResponseDto
  // })
  // @ApiResponse({
  //   status: 500,
  //   description: '서버 내부 오류',
  //   schema: {
  //     type: 'object',
  //     properties: {
  //       isSuccess: { type: 'boolean', example: false },
  //       code: { type: 'string', example: '500' },
  //       message: { type: 'string', example: '갤러리 데이터 조회 중 오류가 발생했습니다.' }
  //     }
  //   }
  // })
  async getGallery(): Promise<GalleryResponseDto> {
    try {
      const galleryData = await this.canvasHistoryService.getGalleryData();
      return {
        isSuccess: true,
        code: '200',
        message: '요청에 성공하였습니다.',
        data: galleryData
      };
    } catch (error) {
      console.error('[GalleryController] 갤러리 데이터 조회 실패:', error);
      throw new HttpException(
        {
          isSuccess: false,
          code: '500',
          message: '갤러리 데이터 조회 중 오류가 발생했습니다.',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
} 