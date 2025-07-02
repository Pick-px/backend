import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Canvas } from './entity/canvas.entity';
import { Pixel } from '../pixel/entity/pixel.entity';
import { CanvasService } from './canvas.service';
import { CanvasController } from './canvas.controller';
import { CanvasGateway } from './canvas.gateway';
import { Group } from '../group/entity/group.entity'; // 추가

@Module({
  imports: [
    TypeOrmModule.forFeature([Canvas, Pixel, Group]), 
    // ... 기타 모듈
  ],
  controllers: [CanvasController],
  providers: [CanvasService, CanvasGateway],
  exports: [CanvasService],
})
export class CanvasModule {}