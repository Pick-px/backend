import { Process, Processor } from '@nestjs/bull';
import { CanvasGateway } from '../canvas.gateway';

@Processor('canvas-start')
export class CanvasStartProcessor {
  constructor(private readonly gateway: CanvasGateway) {}

  @Process('canvas-start')
  handleCanvasStart(job) {
    const data = job.data;
    console.log('시작 알림 발송');
    this.gateway.server.emit('start_canvas', data);
    console.log('시작 알림 발송 완료');
  }
}
