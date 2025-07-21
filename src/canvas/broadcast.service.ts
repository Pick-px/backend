// import { Injectable } from '@nestjs/common';
// import { Server } from 'socket.io';
// import { waitForSocketServer } from '../socket/socket.manager';

// interface PixelUpdate {
//   canvas_id: string;
//   x: number;
//   y: number;
//   color: string;
//   // owner: number;
// }

// @Injectable()
// export class BroadcastService {
//   private pixelBatchQueue = new Map<string, PixelUpdate[]>();
//   private batchTimeouts = new Map<string, NodeJS.Timeout>();
//   private readonly BATCH_SIZE = 30;
//   private readonly BATCH_TIMEOUT_MS = 16.67; // 60fps (1000ms / 60)
//   private server: Server | null = null;

//   private async getServer(): Promise<Server> {
//     if (this.server) return this.server;
//     this.server = await waitForSocketServer(); // 🔐 안전
//     return this.server;
//   }

//   addPixelToBatch(pixel: PixelUpdate, immediate: boolean = false) {
//     const { canvas_id } = pixel;

//     // 즉시 브로드캐스트 요청이면 바로 처리
//     if (immediate) {
//       const io = await this.getServer();
//       io.to(`canvas_${canvas_id}`).emit('pixel_update', {
//         pixels: [pixel],
//       });
//       return;
//     }

//     if (!this.pixelBatchQueue.has(canvas_id)) {
//       this.pixelBatchQueue.set(canvas_id, []);
//     }

//     this.pixelBatchQueue.get(canvas_id)!.push(pixel);

//     // 배치 크기 도달 시 즉시 flush
//     if (this.pixelBatchQueue.get(canvas_id)!.length >= this.BATCH_SIZE) {
//       this.flushBatch(canvas_id);
//     } else {
//       this.scheduleBatchFlush(canvas_id);
//     }
//   }

//   private scheduleBatchFlush(canvas_id: string) {
//     if (this.batchTimeouts.has(canvas_id)) return;

//     const timeout = setTimeout(() => {
//       this.flushBatch(canvas_id);
//       this.batchTimeouts.delete(canvas_id);
//     }, this.BATCH_TIMEOUT_MS);

//     this.batchTimeouts.set(canvas_id, timeout);
//   }

//   private async flushBatch(canvas_id: string) {
//     const io = await this.getServer();

//     const pixels = this.pixelBatchQueue.get(canvas_id);
//     if (!pixels || pixels.length === 0) return;

//     // 배치로 전송
//     io.to(`canvas_${canvas_id}`).emit('pixel_update', { pixels: pixels });
//     this.pixelBatchQueue.set(canvas_id, []);
//   }

//   private flushAllBatches() {
//     for (const canvas_id of this.pixelBatchQueue.keys()) {
//       this.flushBatch(canvas_id);
//     }
//   }
// }

import { Injectable, OnModuleInit } from '@nestjs/common';
import { Server } from 'socket.io';
import { waitForSocketServer } from '../socket/socket.manager';

interface PixelUpdate {
  canvas_id: string;
  x: number;
  y: number;
  color: string;
}

@Injectable()
export class BroadcastService implements OnModuleInit {
  private pixelBatchQueue = new Map<string, PixelUpdate[]>();
  private batchTimeout: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 50;
  private readonly BATCH_TIMEOUT_MS = 16.67; // 60fps (1000ms / 60)
  private server: Server | null = null;

  // 모듈 초기화 시 서버 인스턴스 가져오기
  async onModuleInit() {
    try {
      this.server = await waitForSocketServer();
      console.log('[BroadcastService] Socket 서버 인스턴스 획득 성공');
    } catch (error) {
      console.error(
        '[BroadcastService] Socket 서버 인스턴스 획득 실패:',
        error
      );
    }
  }

  // 즉시 브로드캐스트 옵션 추가
  addPixelToBatch(pixel: PixelUpdate, immediate: boolean = false) {
    if (!this.server) {
      console.error('[BroadcastService] Socket 서버 인스턴스가 없습니다');
      return;
    }

    const { canvas_id } = pixel;

    // 즉시 브로드캐스트 요청이면 바로 처리
    if (immediate) {
      this.server.to(`canvas_${canvas_id}`).emit('pixel_update', {
        pixels: [pixel],
      });
      return;
    }

    // 그 외는 기존 배치 처리 로직
    if (!this.pixelBatchQueue.has(canvas_id)) {
      this.pixelBatchQueue.set(canvas_id, []);
    }

    this.pixelBatchQueue.get(canvas_id)!.push(pixel);

    // 배치 크기 도달 시 즉시 flush
    if (this.pixelBatchQueue.get(canvas_id)!.length >= this.BATCH_SIZE) {
      this.flushBatch(canvas_id);
    } else {
      this.scheduleBatchFlush();
    }
  }

  private scheduleBatchFlush() {
    if (this.batchTimeout) return;

    this.batchTimeout = setTimeout(() => {
      this.flushAllBatches();
      this.batchTimeout = null;
    }, this.BATCH_TIMEOUT_MS);
  }

  private flushBatch(canvas_id: string) {
    if (!this.server) {
      console.error('[BroadcastService] Socket 서버 인스턴스가 없습니다');
      return;
    }

    const pixels = this.pixelBatchQueue.get(canvas_id);
    if (!pixels || pixels.length === 0) return;

    // 배치로 전송
    this.server
      .to(`canvas_${canvas_id}`)
      .emit('pixel_update', { pixels: pixels });
    this.pixelBatchQueue.set(canvas_id, []);
  }

  private flushAllBatches() {
    for (const canvas_id of this.pixelBatchQueue.keys()) {
      this.flushBatch(canvas_id);
    }
  }
}
