import { historyQueue, alarmQueue } from '../queues/bullmq.queue';
import { Canvas } from '../canvas/entity/canvas.entity';

async function isEndingWithOneDay(canvas: Canvas) {
  const now = Date.now();
  const endedAtTime = new Date(canvas.endedAt).getTime();
  const delay = endedAtTime - now;

  // 1일 이내 종료되는 경우 → 큐에 바로 등록
  const ONE_DAYS = 1000 * 60 * 60 * 24 * 1;
  const jobId = `history-${canvas.id}`;

  if (delay > 0 && delay <= ONE_DAYS) {
    await historyQueue.add(
      'canvas-history',
      {
        canvas_id: canvas.id,
        size_x: canvas.sizeX,
        size_y: canvas.sizeY,
        type: canvas.type,
      },
      { jobId: jobId, delay }
    );
  }
}

async function putJobOnAlarmQueueThreeSecBeforeEnd(canvas: Canvas) {
  const now = Date.now();
  const endedAtTime = new Date(canvas.endedAt).getTime();
  const delay = endedAtTime - now - 3 * 1000;

  console.log('before end : ', delay);

  // 1일 이내 종료되는 경우 → 큐에 바로 등록
  const ONE_DAYS = 1000 * 60 * 60 * 24 * 1;
  const jobId = `3sec-before-end-${canvas.id}`;

  if (delay > 0 && delay <= ONE_DAYS) {
    await alarmQueue.add(
      '3sec-before-end',
      {
        canvas_id: canvas.id,
        title: canvas.title,
        endedAt: canvas.endedAt,
      },
      { jobId: jobId, delay }
    );
  }
}

async function putJobOnAlarmQueueBeforeStart30s(canvas: Canvas) {
  const now = Date.now();
  const startTime = new Date(canvas.startedAt).getTime();
  const delay = startTime - now - 30 * 1000;
  const Id = `30sec-before-start-${canvas.id}`;

  console.log('30s before start : ', delay);
  // 1일 이내 종료되는 경우 → 큐에 바로 등록
  const ONE_DAYS = 1000 * 60 * 60 * 24 * 1;

  if (delay > 0 && delay <= ONE_DAYS) {
    try {
      await alarmQueue.add(
        '30sec-before-start',
        {
          canvas_id: canvas.id,
          title: canvas.title,
          startedAt: canvas.startedAt,
        },
        {
          jobId: Id,
          delay,
        }
      );
    } catch (err) {
      console.error('startQueue.add 중 오류 발생:', err);
    }
  }
}

async function putJobOnAlarmQueue3SecsBeforeStart(canvas: Canvas) {
  const now = Date.now();
  const startTime = new Date(canvas.startedAt).getTime();
  const delay = startTime - now - 3 * 1000;
  const Id = `3sec-before-start-${canvas.id}`;
  const ONE_DAYS = 1000 * 60 * 60 * 24 * 1;
  console.log('3s before start : ', delay);
  if (delay > 0 && delay <= ONE_DAYS) {
    try {
      await alarmQueue.add(
        '3sec-before-start',
        {
          canvas_id: canvas.id,
          title: canvas.title,
          startedAt: canvas.startedAt,
        },
        {
          jobId: Id,
          delay,
        }
      );
    } catch (err) {
      console.log(err);
    }
  }
}

async function putJobOnAlarmQueueGameEnd(canvas: Canvas) {
  if (canvas.type !== 'game_calculation') return;
  const now = Date.now();
  const endedAtTime = new Date(canvas.endedAt).getTime();
  const delay = endedAtTime - now;
  const ONE_DAYS = 1000 * 60 * 60 * 24 * 1;
  const jobId = `game-end-${canvas.id}`;
  if (delay > 0 && delay <= ONE_DAYS) {
    await alarmQueue.add(
      'game-end',
      {
        canvas_id: canvas.id,
        title: canvas.title,
        endedAt: canvas.endedAt,
      },
      { jobId: jobId, delay }
    );
  }
}

export {
  putJobOnAlarmQueue3SecsBeforeStart,
  putJobOnAlarmQueueBeforeStart30s,
  putJobOnAlarmQueueThreeSecBeforeEnd,
  isEndingWithOneDay,
  putJobOnAlarmQueueGameEnd,
};
