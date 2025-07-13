import { Module } from '@nestjs/common';
import { PixelService } from './pixel.service';

@Module({
  imports: [],
  providers: [PixelService],
  exports: [PixelService],
})
export class PixelModule {}
