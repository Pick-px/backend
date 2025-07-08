import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

interface PixelUpdate {
  canvas_id: string;
  x: number;
  y: number;
  color: string;
}

@Injectable()
export class BroadcastService {
  private pixelBatchQueue = new Map<string, PixelUpdate[]>();
  private batchTimeout: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 50;
  private readonly BATCH_TIMEOUT_MS = 16.67; // 60fps (1000ms / 60)

  constructor(private server: Server) {}

  addPixelToBatch(pixel: PixelUpdate) {
    const { canvas_id } = pixel;

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
    const pixels = this.pixelBatchQueue.get(canvas_id);
    if (!pixels || pixels.length === 0) return;

    // 배치로 전송
    this.server.to(canvas_id).emit('pixel_batch_update', { pixels });
    this.pixelBatchQueue.set(canvas_id, []);
  }

  private flushAllBatches() {
    for (const canvas_id of this.pixelBatchQueue.keys()) {
      this.flushBatch(canvas_id);
    }
  }
}
