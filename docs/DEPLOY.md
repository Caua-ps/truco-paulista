# Deploy

Guia mínimo para colocar o MVP em produção. Os artefatos de build (Dockerfiles,
`fly.toml`, `docker-compose.yml`) já estão prontos; aqui ficam os passos manuais
que dependem de contas e segredos.

## Infraestrutura necessária

- **PostgreSQL** gerenciado (Supabase, Neon, Railway, RDS).
- **Redis** gerenciado (Upstash, Railway, Redis Cloud) — presença, matchmaking e cache.
- Host para a **API** (Fly.io/Railway/Render) e para a **web** (Vercel/Fly).

## Migração do banco

O container da API roda `prisma migrate deploy` no boot (ver `apps/api/Dockerfile`),
então a migração inicial é aplicada automaticamente no primeiro deploy. Para rodar
manualmente:

```bash
cd apps/api
DATABASE_URL="postgresql://..." npm run prisma:deploy
```

## API no Fly.io

```bash
cd apps/api
fly launch --no-deploy                       # usa o fly.toml deste diretório
fly secrets set \
  DATABASE_URL="postgresql://..." \
  REDIS_URL="redis://..." \
  JWT_SECRET="..." JWT_REFRESH_SECRET="..." \
  WEB_ORIGIN="https://seu-dominio.app" \
  MAIL_FROM="Truco Paulista <no-reply@seu-dominio.app>" \
  SMTP_HOST="..." SMTP_PORT="587" SMTP_USER="..." SMTP_PASS="..." \
  SENTRY_DSN="..."
fly deploy --dockerfile apps/api/Dockerfile --build-context .
```

Health checks: `GET /health` (liveness) e `GET /ready` (banco + Redis acessíveis).

## Web no Vercel

Configure as variáveis `NEXT_PUBLIC_API_URL` e `NEXT_PUBLIC_WS_URL` apontando para
a URL pública da API e faça o deploy do diretório `apps/web`.

## Observabilidade

- **Sentry**: defina `SENTRY_DSN`. Sem ele, o Sentry fica inerte.
- **Logs estruturados** (pino): JSON em produção; ajuste o nível com `LOG_LEVEL`.

## E-mail transacional

Defina as variáveis `SMTP_*` e `MAIL_FROM`. Funciona com qualquer provedor SMTP
(Resend, SES, SendGrid, Postmark). Sem `SMTP_HOST`, os e-mails apenas são logados.
