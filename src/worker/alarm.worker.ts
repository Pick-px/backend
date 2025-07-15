// src/queues/start.worker.ts
import { Job, Worker } from 'bullmq';
import { redisConnection } from '../queues/bullmq.config';
import { Server } from 'socket.io';
import { getSocketServer } from '../socket/socket.manager';

const alarmWorker = new Worker(
  'canvas-alarm',
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
alarmWorker.on('completed', (job) => {
  console.log(`✅ [Worker] Job completed: ${job.id}`);
});

alarmWorker.on('failed', (job, err) => {
  console.error(`❌ [Worker] Job failed: ${job?.id}`, err);
});
export { alarmWorker };
