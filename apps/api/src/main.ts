import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { API_PREFIX } from '@sms/shared';
import { AppModule } from './app.module';
import { Env } from './config/env';
import { configureApp } from './setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  configureApp(app, config.get('WEB_URL', { infer: true }));

  // Spec §7: API docs at /api/docs, outside production only.
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    const doc = new DocumentBuilder()
      .setTitle('Sales Management System API')
      .setDescription('Waqar Rice Mills. Auth: httpOnly cookies set by POST /api/v1/auth/login.')
      .addCookieAuth('sms_at')
      .build();
    SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, doc));
  }

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}/${API_PREFIX}`);
}

void bootstrap();
