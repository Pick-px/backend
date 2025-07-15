import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Express } from 'express';
import * as dotenv from 'dotenv';
import './worker/alarm.worker';
import { ValidationPipe } from '@nestjs/common';
const cookieParser = require('cookie-parser');

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const secret: string = process.env.JWT_SECRET!;
  const expressApp = app.getHttpAdapter().getInstance() as Express;
  expressApp.set('trust proxy', 1);
  app.use(cookieParser(secret));
  app.useWebSocketAdapter(new IoAdapter(app));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    })
  );

  try {
    const config = new DocumentBuilder()
      .setTitle('Pick-Px API')
      .setDescription('Pick-Px 백엔드 API 문서입니다.')
      .setVersion('1.0')
      .addTag('canvas', 'user')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
  } catch (error) {
    console.error('❌ Swagger setup error:', error);
  }

  app.enableCors({
    origin: [
      'http://localhost:5173',
      'https://pick-px.com',
      'https://ws.pick-px.com',
      'https://api.pick-px.com', // 새 API 도메인 추가
    ],
    credentials: true,
    exposedHeaders: ['Authorization'],
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 애플리케이션이 포트 ${port}에서 실행 중입니다.`);
  console.log(`📚 Swagger 문서: http://localhost:${port}/api`);
  console.log(`🏥 헬스체크: http://localhost:${port}/health`);
}
bootstrap();
