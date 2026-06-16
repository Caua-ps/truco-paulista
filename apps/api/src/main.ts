// Sentry precisa ser instrumentado antes de qualquer outro import da app.
import './instrument';

import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { SentryExceptionFilter } from './common/sentry-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Logs estruturados via nestjs-pino para todo o framework.
  app.useLogger(app.get(PinoLogger));

  app.enableCors({
    origin: process.env.WEB_ORIGIN?.split(',') ?? 'http://localhost:3000',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Reporta exceções inesperadas ao Sentry, preservando a resposta padrão.
  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new SentryExceptionFilter(httpAdapter));

  // Fecha conexões (Prisma, Redis, sockets) de forma limpa no SIGTERM do deploy.
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  app.get(PinoLogger).log(`API do Truco Paulista ouvindo na porta ${port}`);
}

void bootstrap();
