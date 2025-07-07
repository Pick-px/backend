import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Canvas } from './entity/canvas.entity';
import { Pixel } from '../pixel/entity/pixel.entity';
import { CanvasService } from './canvas.service';
import { CanvasController } from './canvas.controller';
import { CanvasGateway } from './canvas.gateway';
import { Group } from '../group/entity/group.entity'; // 추가
import { UserCanvas } from '../entity/UserCanvas.entity';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Canvas, Pixel, Group, UserCanvas]), 
    JwtModule.register({}),
    AuthModule,
    // ... 기타 모듈
  ],
  controllers: [CanvasController],
  providers: [CanvasService, CanvasGateway],
  exports: [CanvasService],
})
export class CanvasModule {}