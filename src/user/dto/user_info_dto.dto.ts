import { ApiProperty } from '@nestjs/swagger';

class userCanvasInfo {
  @ApiProperty({ example: 1 })
  canvasId: number;

  @ApiProperty({ example: 'My First Canvas' })
  title: string;

  @ApiProperty({ example: '2025-01-15T09:30:00Z' })
  created_at: Date;

  @ApiProperty({ example: '2025-07-15T00:00:00Z' })
  started_at: Date;

  @ApiProperty({ example: '2025-08-01T00:00:00Z' })
  ended_at: Date;

  @ApiProperty({ example: 100 })
  size_x: number;

  @ApiProperty({ example: 100 })
  size_y: number;

  @ApiProperty({ example: 15 })
  try_count: number;

  @ApiProperty({ nullable: true, example: 7, description: '캔버스 종료 전에는 null, 종료 후에는 본인이 소유한 픽셀 수' })
  own_count: number | null;
}

class UserInfoResponseDto {
  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: '2025-01-01T00:00:00Z' })
  createdAt: Date;

  @ApiProperty({ example: 'nickname123' })
  nickName: string;

  @ApiProperty({
    type: [userCanvasInfo],
    example: [
      {
        canvasId: 1,
        title: 'My First Canvas',
        created_at: '2025-01-15T09:30:00Z',
        started_at: '2025-07-15T00:00:00Z',
        ended_at: '2025-08-01T00:00:00Z',
        size_x: 100,
        size_y: 100,
        try_count: 15,
        own_count: 7
      },
      {
        canvasId: 2,
        title: 'Project Artwork',
        created_at: '2025-02-20T14:00:00Z',
        started_at: '2025-07-15T00:00:00Z',
        ended_at: '2025-08-01T00:00:00Z',
        size_x: 200,
        size_y: 150,
        try_count: 3,
        own_count: null
      }
    ]
  })
  canvases: userCanvasInfo[];
}

export { UserInfoResponseDto, userCanvasInfo };
