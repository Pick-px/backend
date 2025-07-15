import { Queue } from 'bullmq';
import { config } from 'dotenv';
import { redisConnection } from './bullmq.config';
config();

const pixelQueue = new Queue('pixel-generation', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: true,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

const historyQueue = new Queue('canvas-history', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: true,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

const alarmQueue = new Queue('canvas-alarm', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: true,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

export { pixelQueue, historyQueue, alarmQueue };
