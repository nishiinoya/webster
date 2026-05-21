import 'reflect-metadata';
import { NestFactory, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    bodyParser: false, // We set up body parsers manually below
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('port') ?? 4000;
  const corsOrigin = config.get<string[]>('corsOrigin') ?? ['http://localhost:3000'];

  // CORS
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  // Global prefix for REST (WebSocket gateway uses /ws namespace)
  app.setGlobalPrefix('api');

  // Stripe webhook needs raw body — wire it in before the global JSON parser
  app.use(
    '/api/subscriptions/webhook',
    express.raw({ type: 'application/json' }),
  );

  // Standard JSON body parser for all other routes
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Webster API')
    .setDescription('Webster collaborative image editor API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port);
  logger.log(`Webster API running on http://localhost:${port}/api`);
  logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();
