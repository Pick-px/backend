// redis.module.ts
import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        const redis = new Redis({
          host: configService.get('REDIS_HOST'),
          port: configService.get<number>('REDIS_PORT') || 6379,
          password: configService.get('REDIS_PASSWORD') || undefined,
        });

        // Redis 메모리 모니터링
        setInterval(async () => {
          try {
            const info = await redis.info('memory');
            const usedMemory = info.match(/used_memory_human:(\S+)/)?.[1];
            const maxMemory = info.match(/maxmemory_human:(\S+)/)?.[1];

            if (usedMemory && maxMemory) {
              console.log(
                `[Redis 메모리] 사용: ${usedMemory}, 최대: ${maxMemory}`
              );
            }
          } catch (error) {
            console.warn('[Redis] 메모리 모니터링 실패:', error);
          }
        }, 60000); // 1분마다

        return redis;
      },
      inject: [ConfigService],
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}
