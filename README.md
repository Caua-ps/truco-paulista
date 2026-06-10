# 🃏 Truco Paulista Online

Plataforma multiplayer de Truco Paulista em tempo real: Web hoje, mobile
(React Native) amanhã — com a regra do jogo isolada em um pacote compartilhado.

## Estrutura do monorepo

```
truco/
├── packages/
│   └── game-core/      # Motor de regras (TS puro, 0 dependências, 23 testes)
├── apps/
│   ├── api/            # NestJS: REST + WebSocket, Prisma, Redis, JWT/Google
│   └── web/            # Next.js + Tailwind + PWA
├── docs/
│   ├── ARCHITECTURE.md # Desenho geral e decisões
│   ├── AUTH.md         # Fluxo de autenticação completo
│   ├── SCALABILITY.md  # Plano de escala por gatilhos
│   ├── MONETIZATION.md # Ads entre partidas, Premium, loja cosmética
│   └── ROADMAP.md      # Fases 0–5
├── docker-compose.yml  # Postgres + Redis + API + Web
└── .github/workflows/ci.yml
```

## Rodando em desenvolvimento

Pré-requisitos: Node 20+, Docker (para Postgres/Redis).

```bash
# 1. Dependências
npm install

# 2. Infra local (Postgres + Redis)
docker compose up -d postgres redis

# 3. Configuração da API
cp apps/api/.env.example apps/api/.env

# 4. Banco: migração inicial + seed
npm run db:migrate            # prisma migrate dev
node apps/api/prisma/seed.mjs # cosméticos e missões iniciais

# 5. Motor (a API consome o build)
npm run build --workspace=packages/game-core

# 6. Subir tudo (dois terminais)
npm run dev --workspace=apps/api   # http://localhost:3001
npm run dev --workspace=apps/web   # http://localhost:3000
```

Para testar uma partida sozinho: abra duas janelas (uma anônima), crie duas
contas, crie uma mesa 1x1 em uma janela e entre com o código na outra.

## Testes e verificação

```bash
npm run test:core                        # regras do truco (vitest)
npm run typecheck --workspace=apps/api   # typecheck do backend
npm run build                            # build completo dos 3 pacotes
```

## Tudo em containers

```bash
docker compose up --build   # web :3000, api :3001
```

## Funcionalidades implementadas

- **Jogo**: baralho de 40 cartas, vira/manilhas, melhor de 3 com todas as
  regras de empate, truco→6→9→12 (aceitar/correr/aumentar), mão de onze,
  mão de ferro, carta coberta, validação 100% server-side.
- **Modos**: 1x1 e 2x2 · casual e ranqueada (Elo) · sala privada por código ·
  matchmaking automático por rating.
- **Tempo real**: Socket.IO autenticado, reconexão com retomada de partida,
  W.O. após 60s, presença online, chat com rate limit, emojis rápidos.
- **Conta**: cadastro/login, Google OAuth, verificação de e-mail, reset de
  senha, refresh com rotação, perfil público, XP/nível, histórico, replay (API).
- **Plataforma**: ranking global/semanal/mensal com cache, amigos (API),
  loja cosmética, Premium (sem pay-to-win), painel admin (API), denúncias,
  logs de auditoria.

## Variáveis de ambiente

Veja [apps/api/.env.example](apps/api/.env.example). No frontend:
`NEXT_PUBLIC_API_URL` e `NEXT_PUBLIC_WS_URL` (padrão `http://localhost:3001`).
