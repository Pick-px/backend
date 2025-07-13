// redis.module.ts
import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigModule, ConfigService } from '@nestjs/config';

/*
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
        return redis;
      },
*/

// === Redis 클라이언트 팩토리 함수 (멀티서버 환경 최적화) ===
const createRedisClient = (configService: ConfigService): Redis => {
  const redisUrl = configService.get<string>('REDIS_URL');
  const host = configService.get<string>('REDIS_HOST') || 'redis';
  const port = configService.get<number>('REDIS_PORT') || 6379;
  const password = configService.get<string>('REDIS_PASSWORD') || '';
  const db = configService.get<number>('REDIS_DB') || 0;

  let redis: Redis;

  if (redisUrl) {
    // 프로덕션: REDIS_URL 사용 (ElastiCache Serverless with TLS)
    console.log('[Redis] REDIS_URL을 사용하여 연결 시도');
    redis = new Redis(redisUrl, {
      tls: redisUrl.startsWith('rediss://')
        ? {
            // ElastiCache Serverless TLS 설정
            rejectUnauthorized: false,
          }
        : undefined,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 100, 3000);
        console.log(`[Redis] 재연결 시도 ${times}회, ${delay}ms 후 재시도`);
        return delay;
      },
      lazyConnect: false, // 즉시 연결 시도
      connectTimeout: 15000,
      commandTimeout: 10000,
      keepAlive: 30000,
      family: 4, // IPv4 강제 사용
      enableReadyCheck: true,
    });
  } else {
    // 로컬 개발: 기존 설정 사용
    console.log(`[Redis] 개별 환경변수 사용: ${host}:${port}`);
    redis = new Redis({
      host,
      port,
      password: password || undefined,
      db,
      lazyConnect: false, // 즉시 연결 시도
      connectTimeout: 10000,
      commandTimeout: 5000,
      keepAlive: 30000,
      family: 4,
      enableReadyCheck: true,
    });
  }

  // 연결 이벤트 리스너
  redis.on('connect', () => {
    console.log(`[Redis] 연결 성공: ${host}:${port}`);
  });

  redis.on('ready', () => {
    console.log(`[Redis] 준비 완료: ${host}:${port} (상태: ${redis.status})`);
  });

  redis.on('error', (error) => {
    console.error(`[Redis] 연결 에러:`, error);
  });

  redis.on('close', () => {
    console.log(`[Redis] 연결 종료`);
  });

  redis.on('reconnecting', (delay) => {
    console.log(`[Redis] 재연결 시도 중... ${delay}ms 후`);
  });

  redis.on('end', () => {
    console.log(`[Redis] 연결 종료됨`);
  });

  return redis;
};

// === 3개 Redis 분리 설정 ===
/*
const createRedisClient = (config: ConfigService, prefix: string): Redis => {
  const host = config.get(`${prefix}_HOST`) || config.get('REDIS_HOST') || 'localhost';
  const port = config.get(`${prefix}_PORT`) || config.get('REDIS_PORT') || 6379;
  const password = config.get(`${prefix}_PASSWORD`) || config.get('REDIS_PASSWORD') || '';
  const db = config.get(`${prefix}_DB`) || config.get('REDIS_DB') || 0;

  const redis = new Redis({
    host,
    port,
    password: password || undefined,
    db,
    lazyConnect: true,
  });

  // 연결 이벤트 리스너
  redis.on('connect', () => {
    console.log(`[Redis ${prefix}] 연결 성공: ${host}:${port}`);
  });

  redis.on('error', (error) => {
    console.error(`[Redis ${prefix}] 연결 에러:`, error);
  });

  redis.on('close', () => {
    console.log(`[Redis ${prefix}] 연결 종료`);
  });

  return redis;
};

// Redis 클러스터 클라이언트 팩토리 (선택사항)
const createRedisCluster = (config: ConfigService, prefix: string): Redis => {
  const clusterEnabled = config.get('REDIS_CLUSTER_ENABLED') === 'true';
  
  if (!clusterEnabled) {
    return createRedisClient(config, prefix);
  }

  const nodes = config.get('REDIS_CLUSTER_NODES')?.split(',') || [];
  
  if (nodes.length === 0) {
    console.warn(`[Redis ${prefix}] 클러스터 노드가 설정되지 않음, 단일 Redis 사용`);
    return createRedisClient(config, prefix);
  }

  // 클러스터 모드에서는 단일 Redis 클라이언트로 대체 (타입 호환성)
  console.warn(`[Redis ${prefix}] 클러스터 모드는 현재 지원되지 않음, 단일 Redis 사용`);
  return createRedisClient(config, prefix);
};
*/

// === Redis 모니터링 서비스 (통합 버전) ===
class RedisMonitoringService {
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(private readonly redis: Redis) {}

  startMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      return await this.monitorRedisStatus();
    }, 60000); // 10분마다 모니터링
  }

  async monitorRedisStatus(): Promise<void> {
    try {
      const info = await this.getRedisInfo();
      console.log('[Redis 모니터링]', {
        ...info,
        timestamp: new Date().toISOString(),
      });
      // 메모리 사용량 경고
      if (info.memoryUsage > 80) {
        console.warn(
          '[Redis 모니터링] 메모리 사용량 경고:',
          `${info.memoryUsage}%`
        );
      }
      return;
    } catch (error) {
      console.error('[Redis 모니터링] 에러:', error);
    }
  }

  private async getRedisInfo(): Promise<any> {
    try {
      const info = await this.redis.info();
      const lines = info.split('\r\n');

      let usedMemory = 0;
      let maxMemory = 0;
      let connectedClients = 0;
      let keyspaceHits = 0;
      let keyspaceMisses = 0;

      for (const line of lines) {
        if (line.startsWith('used_memory:')) {
          usedMemory = parseInt(line.split(':')[1]);
        } else if (line.startsWith('maxmemory:')) {
          maxMemory = parseInt(line.split(':')[1]);
        } else if (line.startsWith('connected_clients:')) {
          connectedClients = parseInt(line.split(':')[1]);
        } else if (line.startsWith('keyspace_hits:')) {
          keyspaceHits = parseInt(line.split(':')[1]);
        } else if (line.startsWith('keyspace_misses:')) {
          keyspaceMisses = parseInt(line.split(':')[1]);
        }
      }

      const memoryUsage =
        maxMemory > 0 ? Math.round((usedMemory / maxMemory) * 100) : 0;
      const hitRate =
        keyspaceHits + keyspaceMisses > 0
          ? Math.round((keyspaceHits / (keyspaceHits + keyspaceMisses)) * 100)
          : 0;

      return {
        memoryUsage,
        usedMemory: this.formatBytes(usedMemory),
        maxMemory: this.formatBytes(maxMemory),
        connectedClients,
        hitRate: `${hitRate}%`,
        status: 'connected',
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
      };
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }
}

// === 3개 Redis 모니터링 서비스 ===
/*
class RedisMonitoringService {
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly pixelRedis: Redis,
    private readonly chatRedis: Redis,
    private readonly defaultRedis: Redis
  ) {}

  startMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      await this.monitorRedisStatus();
    }, 600000); // 10분마다 모니터링
  }

  async monitorRedisStatus(): Promise<void> {
    try {
      // 픽셀 Redis 모니터링
      const pixelInfo = await this.getRedisInfo(this.pixelRedis, 'PIXEL');
      
      // 채팅 Redis 모니터링
      const chatInfo = await this.getRedisInfo(this.chatRedis, 'CHAT');
      
      // 기본 Redis 모니터링
      const defaultInfo = await this.getRedisInfo(this.defaultRedis, 'DEFAULT');

      console.log('[Redis 모니터링]', {
        pixel: pixelInfo,
        chat: chatInfo,
        default: defaultInfo,
        timestamp: new Date().toISOString()
      });

      // 메모리 사용량 경고
      if (pixelInfo.memoryUsage > 80 || chatInfo.memoryUsage > 80) {
        console.warn('[Redis 모니터링] 메모리 사용량 경고:', {
          pixel: `${pixelInfo.memoryUsage}%`,
          chat: `${chatInfo.memoryUsage}%`
        });
      }

    } catch (error) {
      console.error('[Redis 모니터링] 에러:', error);
    }
  }

  private async getRedisInfo(redis: Redis, prefix: string): Promise<any> {
    try {
      const info = await redis.info();
      const lines = info.split('\r\n');
      
      let usedMemory = 0;
      let maxMemory = 0;
      let connectedClients = 0;
      let keyspaceHits = 0;
      let keyspaceMisses = 0;

      for (const line of lines) {
        if (line.startsWith('used_memory:')) {
          usedMemory = parseInt(line.split(':')[1]);
        } else if (line.startsWith('maxmemory:')) {
          maxMemory = parseInt(line.split(':')[1]);
        } else if (line.startsWith('connected_clients:')) {
          connectedClients = parseInt(line.split(':')[1]);
        } else if (line.startsWith('keyspace_hits:')) {
          keyspaceHits = parseInt(line.split(':')[1]);
        } else if (line.startsWith('keyspace_misses:')) {
          keyspaceMisses = parseInt(line.split(':')[1]);
        }
      }

      const memoryUsage = maxMemory > 0 ? Math.round((usedMemory / maxMemory) * 100) : 0;
      const hitRate = (keyspaceHits + keyspaceMisses) > 0 
        ? Math.round((keyspaceHits / (keyspaceHits + keyspaceMisses)) * 100) 
        : 0;

      return {
        memoryUsage,
        usedMemory: this.formatBytes(usedMemory),
        maxMemory: this.formatBytes(maxMemory),
        connectedClients,
        hitRate: `${hitRate}%`,
        status: 'connected'
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }
}
*/

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    // === 통합 Redis 클라이언트 ===
    {
      provide: 'REDIS_CLIENT',
      useFactory: (config: ConfigService) => createRedisClient(config),
      inject: [ConfigService],
    },
    {
      provide: 'REDIS_MONITORING',
      useFactory: (redis: Redis) => {
        const monitoring = new RedisMonitoringService(redis);
        monitoring.startMonitoring();
        return monitoring;
      },
      inject: ['REDIS_CLIENT'],
    },

    // === 3개 Redis 클라이언트 ===
    /*
    {
      provide: 'REDIS_CLIENT',
      useFactory: (config: ConfigService) => createRedisClient(config, 'REDIS'),
      inject: [ConfigService],
    },
    {
      provide: 'REDIS_PIXEL_CLIENT',
      useFactory: (config: ConfigService) => createRedisCluster(config, 'REDIS_PIXEL'),
      inject: [ConfigService],
    },
    {
      provide: 'REDIS_CHAT_CLIENT',
      useFactory: (config: ConfigService) => createRedisCluster(config, 'REDIS_CHAT'),
      inject: [ConfigService],
    },
    {
      provide: 'REDIS_MONITORING',
      useFactory: (pixelRedis: Redis, chatRedis: Redis, defaultRedis: Redis) => {
        const monitoring = new RedisMonitoringService(pixelRedis, chatRedis, defaultRedis);
        monitoring.startMonitoring();
        return monitoring;
      },
      inject: ['REDIS_PIXEL_CLIENT', 'REDIS_CHAT_CLIENT', 'REDIS_CLIENT'],
    },
    */
  ],
  exports: ['REDIS_CLIENT', 'REDIS_MONITORING'],
  // exports: ['REDIS_CLIENT', 'REDIS_PIXEL_CLIENT', 'REDIS_CHAT_CLIENT', 'REDIS_MONITORING'], // 3개 버전
})
export class RedisModule {}
