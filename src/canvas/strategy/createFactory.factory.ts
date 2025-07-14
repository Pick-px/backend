import { Injectable } from '@nestjs/common';
import { CanvasCreationStrategy } from '../interface/canvasCreateStrategy.interface';
import { PublicCanvasStrategy } from './publicCanvasStrategy.strategy';
import { EventCanvasStrategy } from './eventCanvasStrategy.strategy';
import { GameCanvasStrategy } from './gameCanvasStrategy.strategy';

@Injectable()
export class CanvasStrategyFactory {
  constructor(
    private readonly publicStrategy: PublicCanvasStrategy,
    private readonly eventStrategy: EventCanvasStrategy,
    // gameStrategy 등 추가 가능
    private readonly gameStrategy: GameCanvasStrategy
  ) {}

  getStrategy(type: string): CanvasCreationStrategy {
    switch (type) {
      case 'game':
        return this.gameStrategy;
      case 'event':
        return this.eventStrategy;
      case 'public':
        return this.publicStrategy;
      default:
        return this.eventStrategy;
    }
  }
}
