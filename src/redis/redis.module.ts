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
        const redisUrl = configService.get<string>('REDIS_URL');

        let redis: Redis;

        if (redisUrl) {
          // 프로덕션: REDIS_URL 사용 (TLS 지원)
          redis = new Redis(redisUrl, {
            tls: redisUrl.startsWith('rediss://') ? {} : undefined,
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3,
          });
        } else {
          // 로컬 개발: 기존 설정 사용
          redis = new Redis({
            host: configService.get('REDIS_HOST') || 'redis',
            port: configService.get<number>('REDIS_PORT') || 6379,
            password: configService.get('REDIS_PASSWORD') || undefined,
          });
        }

        // Redis 연결 상태 모니터링
        redis.on('connect', () => {
          console.log('✅ Redis 연결 성공');
        });

        redis.on('error', (error) => {
          console.error('❌ Redis 연결 오류:', error);
        });

        // Redis 메모리 모니터링 (프로덕션에서만)
        if (process.env.NODE_ENV === 'production') {
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
          }, 300000); // 5분마다
        }

        return redis;
      },
      inject: [ConfigService],
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}
