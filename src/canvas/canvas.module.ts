import { Module } from '@nestjs/common';
import { CanvasGateway } from './canvas.gateway';
import { CanvasService } from './canvas.service';
import { DatabaseModule } from 'src/database/database.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Canvas } from './entity/canvas.entity';
import { CanvasController } from './canvas.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Canvas]), DatabaseModule],
  controllers: [CanvasController],
  providers: [CanvasGateway, CanvasService],
})
export class CanvasModule {}
