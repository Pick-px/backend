// src/queues/start.worker.ts
import { Job, Worker } from 'bullmq';
import { redisConnection } from '../queues/bullmq.config';
import { Server } from 'socket.io';
import { getSocketServer } from '../socket/socket.manager';

interface JobData {
  canvas_id: number;
  title: string;
  startedAt?: Date;
  endedAt?: Date;
}

const alarmWorker = new Worker(
  'canvas-alarm',
  async (job: Job) => {
    const io: Server = getSocketServer(); // 소켓 서버 가져오기
    const data: JobData = job.data as JobData;
    switch (job.name) {
      case '3sec-before-end':
        return handleThreeSecBeforeEnd(data, io);
      case '30sec-before-start':
        return handleThirtySecBeforeStart(data, io);
      case '3sec-before-start':
        return handleThreeSecBeforeStart(data, io);
      default:
        console.warn(`Unhandled job name: ${job.name}`);
    }
  },
  { connection: redisConnection }
);

function handleThirtySecBeforeStart(data: JobData, io: Server) {
  const { canvas_id, title, startedAt } = data;
  console.log('30초 전 알람 실행');
  io.emit('canvas_open_alarm', {
    canvas_id: canvas_id,
    title: title,
    started_at: startedAt,
    server_time: new Date(),
    remain_time: 30,
  });
  console.log('30초 전 알람 발송');
}

function handleThreeSecBeforeEnd(data: JobData, io: Server) {
  const { canvas_id, title, endedAt } = data;
  const id = `canvas_${canvas_id}`;

  console.log('끝나기 3초전 알람 발행');
  io.to(id).emit('canvas_close_alarm', {
    canvas_id: canvas_id,
    title: title,
    ended_at: endedAt,
    server_time: new Date(),
    remain_time: 3,
  });
  console.log('끝나기 3초전 알람 발송');
}

function handleThreeSecBeforeStart(data: JobData, io: Server) {
  const { canvas_id, title, startedAt } = data;
  const id = `canvas_${canvas_id}`;

  console.log('시작 3초전 알람 발행');
  io.to(id).emit('canvas_open_alarm', {
    canvas_id: canvas_id,
    title: title,
    started_at: startedAt,
    server_time: new Date(),
    remain_time: 3,
  });
  console.log('시작 3초전 알람 발송');
}
alarmWorker.on('completed', (job) => {
  console.log(`✅ [Worker] Job completed: ${job.id}`);
});

alarmWorker.on('failed', (job, err) => {
  console.error(`❌ [Worker] Job failed: ${job?.id}`, err);
});
export { alarmWorker };
