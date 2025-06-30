import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));

  try {
    const config = new DocumentBuilder()
      .setTitle('Pick-Px API')
      .setDescription('Pick-Px 백엔드 API 문서입니다.')
      .setVersion('1.0')
      .addTag('canvas', 'user')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
  } catch (error) {
    console.error('❌ Swagger setup error:', error);
  }

  app.enableCors({
    origin: 'http://localhost:5173',
    credentials: true,
    exposedHeaders: ['Authorization'],
  });
  // [*] NestJS의 @WebSocketGateway()에 CORS 옵션을 이미 줬지만, NestJS는 내부적으로 Express 인스턴스를 쓰고 있기 때문에,
  // 프론트엔드가 socket.io에 연결을 시도할 때 초기 HTTP 핸드셰이크 요청 자체가 Express에서 막히는 상황을 제거
  app.setGlobalPrefix('api'); // 👈 모든 라우트 앞에 /api가 붙음
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
  //[*] 바인딩 주소 설정 안하면 도커 컨테이너 내부에서만 접근 가능
}
bootstrap();
