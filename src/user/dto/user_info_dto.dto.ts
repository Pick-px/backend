import { ApiProperty } from '@nestjs/swagger';

class userCanvasInfo {
  @ApiProperty()
  canvasId: number;

  @ApiProperty()
  title: string;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  size_x: number;
  @ApiProperty()
  size_y: number;
}

class UserInfoResponseDto {
  @ApiProperty()
  email: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  nickName: string;

  @ApiProperty()
  canvases: userCanvasInfo[];
}

export { UserInfoResponseDto, userCanvasInfo };
