import * as Sentry from '@sentry/node';

/**
 * Inicialização do Sentry. Deve ser o PRIMEIRO import do `main.ts` para
 * instrumentar o runtime antes de qualquer outro módulo carregar.
 *
 * Sem `SENTRY_DSN` definido, o Sentry fica inerte (no-op) — nada é enviado,
 * então é seguro manter em desenvolvimento.
 */
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,
    // Amostragem de performance configurável (0 = só erros).
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  });
}
