import { Controller, Get, Res } from '@nestjs/common';
import { AppService } from './app.service';
import { Response } from 'express';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  async getHealth(@Res() res: Response) {
    try {
      // Redis 연결 상태 확인
      const redisStatus = this.redis.status;
      const redisPing = await this.redis.ping();

      const healthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          redis: {
            status: redisStatus,
            ping: redisPing === 'PONG' ? 'ok' : 'failed',
          },
        },
        server: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          pid: process.pid,
        },
      };

      if (redisStatus === 'ready' && redisPing === 'PONG') {
        res.status(200).json(healthStatus);
      } else {
        res.status(503).json({
          ...healthStatus,
          status: 'unhealthy',
          error: 'Redis connection issue',
        });
      }
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
      });
    }
  }
}
