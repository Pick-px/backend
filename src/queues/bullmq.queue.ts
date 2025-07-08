import { Queue } from 'bullmq';
import { config } from 'dotenv';
import { redisConnection } from './bullmq.config';
config();

export const pixelQueue = new Queue('pixel-generation', {
  connection: redisConnection,
});
