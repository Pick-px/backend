import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';
import { waitForSocketServer } from '../socket/socket.manager';

interface PixelUpdate {
  canvas_id: string;
  x: number;
  y: number;
  color: string;
  // owner: number;
}

@Injectable()
export class BroadcastService {
  private pixelBatchQueue = new Map<string, PixelUpdate[]>();
  private batchTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly BATCH_SIZE = 30;
  private readonly BATCH_TIMEOUT_MS = 16.67; // 60fps (1000ms / 60)
  private server: Server | null = null;

  private async getServer(): Promise<Server> {
    if (this.server) return this.server;
    this.server = await waitForSocketServer(); // 🔐 안전
    return this.server;
  }

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
      this.scheduleBatchFlush(canvas_id);
    }
  }

  private scheduleBatchFlush(canvas_id: string) {
    if (this.batchTimeouts.has(canvas_id)) return;

    const timeout = setTimeout(() => {
      this.flushBatch(canvas_id);
      this.batchTimeouts.delete(canvas_id);
    }, this.BATCH_TIMEOUT_MS);

    this.batchTimeouts.set(canvas_id, timeout);
  }

  private async flushBatch(canvas_id: string) {
    const io = await this.getServer();

    const pixels = this.pixelBatchQueue.get(canvas_id);
    if (!pixels || pixels.length === 0) return;

    // 배치로 전송
    io.to(`canvas_${canvas_id}`).emit('pixel_update', { pixels: pixels });
    this.pixelBatchQueue.set(canvas_id, []);
  }

  private flushAllBatches() {
    for (const canvas_id of this.pixelBatchQueue.keys()) {
      this.flushBatch(canvas_id);
    }
  }
}
