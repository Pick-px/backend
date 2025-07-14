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

const startQueue = new Queue('canvas-start', {
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

export { pixelQueue, historyQueue, startQueue };
