import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import * as Sentry from '@sentry/node';

/**
 * Filtro global que reporta exceções não tratadas ao Sentry antes de delegar
 * o tratamento padrão do Nest. Erros HTTP esperados (4xx) e o 5xx normal não
 * deixam de responder ao cliente — apenas os realmente inesperados sobem.
 */
@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : 500;

    // Só reporta o que não é falha de cliente (4xx esperado).
    if (!isHttp || status >= 500) {
      Sentry.captureException(exception);
      this.logger.error(
        exception instanceof Error ? exception.message : 'Erro desconhecido',
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    super.catch(exception, host);
  }
}
