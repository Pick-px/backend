import { Module } from '@nestjs/common';
import { CanvasGateway } from './canvas.gateway';
import { CanvasService } from './canvas.service';
import { DatabaseModule } from 'src/database/database.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Canvas } from './entity/canvas.entity';
import { Pixel } from '../pixel/entity/pixel.entity';
import { CanvasController } from './canvas.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Canvas, Pixel]), DatabaseModule],
  controllers: [CanvasController],
  providers: [CanvasGateway, CanvasService],
})
export class CanvasModule {}
