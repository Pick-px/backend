import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Swagger 설정
  const config = new DocumentBuilder()
    .setTitle('PickPx API')
    .setDescription('픽픽스 백엔드 API 문서입니다.')
    .setVersion('1.0')
    .addTag('PickPx') // 태그는 선택
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document); // /api 경로에서 Swagger UI 제공

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
