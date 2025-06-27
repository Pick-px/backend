import { Injectable } from '@nestjs/common';
import { PixelData } from './interfaces/pixel-data.interface';
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

  // 픽셀 그리기 요청 처리
  // isValid 값을 반환하여 그리기 요청 처리 결과를 클라이언트에 전달
  applyDrawPixel(pixel: PixelData): boolean {
    const isValid = this.tryDrawPixel(pixel);
    return isValid;
  }
}
