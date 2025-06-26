import { Injectable } from '@nestjs/common';

interface PixelData {
  x: number;
  y: number;
  color: string;
}

@Injectable()
export class CanvasService {
  // 임시: 메모리 저장 (실서비스는 DB/Redis 등 사용)
  private pixels: Map<string, string> = new Map();

  // 픽셀 선점(동시성) 로직
  tryDrawPixel({ x, y, color }: PixelData): boolean {
    const key = `${x},${y}`;
    if (this.pixels.has(key)) {
      // 이미 선점된 픽셀이면 무시
      return false;
    }
    this.pixels.set(key, color);
    return true;
  }

  // 전체 픽셀 데이터 반환
  getAllPixels(): PixelData[] {
    return Array.from(this.pixels.entries()).map(([key, color]) => {
      const [x, y] = key.split(',').map(Number);
      return { x, y, color };
    });
  }
}
