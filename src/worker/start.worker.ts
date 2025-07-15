// src/queues/start.worker.ts
import { Job, Worker } from 'bullmq';
import { redisConnection } from '../queues/bullmq.config';
import { Server } from 'socket.io';
import { getSocketServer } from '../socket/socket.manager';

const startWorker = new Worker(
  'canvas-start',
  async (job: Job) => {
    const { canvas_id, title, startedAt } = job.data;

    const io: Server = getSocketServer(); // 소켓 서버 가져오기
    io.emit('canvas_open_alarm', {
      canvas_id: canvas_id,
      title: title,
      started_at: startedAt,
    });

    console.log('✅ 알림 전송 완료');
  },
  { connection: redisConnection }
);
startWorker.on('completed', (job) => {
  console.log(`✅ [Worker] Job completed: ${job.id}`);
});

startWorker.on('failed', (job, err) => {
  console.error(`❌ [Worker] Job failed: ${job?.id}`, err);
});
export { startWorker };
