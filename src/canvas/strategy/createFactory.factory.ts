import { Injectable } from '@nestjs/common';
import { CanvasCreationStrategy } from '../interface/canvasCreateStrategy.interface';
import { PublicCanvasStrategy } from './publicCanvasStrategy.strategy';
import { EventCommonCanvasStrategy } from './eventCommonCanvasStrategy.strategy';
import { EventColorLimitCanvasStrategy } from './eventColorLimitCanvasStrategy.strategy';
import { GameCalculationCanvasStrategy } from './gameCalculationCanvasStrategy.strategy';

@Injectable()
export class CanvasStrategyFactory {
  constructor(
    private readonly publicStrategy: PublicCanvasStrategy,
    private readonly eventCommonStrategy: EventCommonCanvasStrategy,
    private readonly eventColorLimitStrategy: EventColorLimitCanvasStrategy,
    private readonly gameCalculationStrategy: GameCalculationCanvasStrategy
  ) {}

  getStrategy(type: string): CanvasCreationStrategy {
    switch (type) {
      case 'game_calculation':
        return this.gameCalculationStrategy;
      case 'event_common':
        return this.eventCommonStrategy;
      case 'event_colorlimit':
        return this.eventColorLimitStrategy;
      case 'public':
        return this.publicStrategy;
      default:
        return this.eventCommonStrategy;
    }
  }
}
