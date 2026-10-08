# 🃏 Truco Paulista Online

🇧🇷 [Leia em português](README.pt-BR.md)

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000000?logo=nextdotjs&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?logo=socketdotio&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)

A real-time multiplayer platform for Truco Paulista, the Brazilian card game. It runs on the web today, with
mobile (React Native) planned, and the game rules live in a separate shared package so every client uses the
same engine.

## Monorepo layout

```
truco/
├── packages/
│   └── game-core/      # Rules engine (pure TS, zero dependencies, 23 tests)
├── apps/
│   ├── api/            # NestJS: REST + WebSocket, Prisma, Redis, JWT/Google
│   └── web/            # Next.js + Tailwind + PWA
├── docs/
│   ├── ARCHITECTURE.md # Overall design and decisions
│   ├── AUTH.md         # Full authentication flow
│   ├── SCALABILITY.md  # Trigger-based scaling plan
│   ├── MONETIZATION.md # Ads between matches, Premium, cosmetic shop
│   └── ROADMAP.md      # Phases 0–5
├── docker-compose.yml  # Postgres + Redis + API + Web
└── .github/workflows/ci.yml
```

## Running in development

Requirements: Node 20+ and Docker (for Postgres/Redis).

```bash
# 1. Dependencies
npm install

# 2. Local infrastructure (Postgres + Redis)
docker compose up -d postgres redis

# 3. API configuration
cp apps/api/.env.example apps/api/.env

# 4. Database: initial migration + seed
npm run db:migrate            # prisma migrate dev
node apps/api/prisma/seed.mjs # initial cosmetics and missions

# 5. Engine (the API consumes the build)
npm run build --workspace=packages/game-core

# 6. Start everything (two terminals)
npm run dev --workspace=apps/api   # http://localhost:3001
npm run dev --workspace=apps/web   # http://localhost:3000
```

To try a match on your own, open two windows (one private), create two accounts, create a 1v1 table in one
window and join it with the room code from the other.

## Tests and checks

```bash
npm run test:core                        # truco rules (vitest)
npm run typecheck --workspace=apps/api   # backend type-check
npm run build                            # full build of the 3 packages
```

## Everything in containers

```bash
docker compose up --build   # web :3000, api :3001
```

## Features

- **Game**: 40-card deck, *vira*/*manilhas*, best of three with every tie rule, truco → 6 → 9 → 12
  (accept / fold / raise), *mão de onze*, *mão de ferro*, face-down card, all moves validated server-side.
- **Modes**: 1v1 and 2v2 · casual and ranked (Elo) · private rooms by code · automatic rating-based matchmaking.
- **Real time**: authenticated Socket.IO, reconnection with match resumption, forfeit after 60 s, online presence,
  rate-limited chat, quick emojis.
- **Accounts**: sign-up/login, Google OAuth, email verification, password reset, refresh-token rotation, public
  profile, XP/levels, match history, replays (API).
- **Platform**: global/weekly/monthly leaderboards with caching, friends (API), cosmetic shop, Premium (no
  pay-to-win), admin panel (API), player reports, audit logs.

## Environment variables

See [apps/api/.env.example](apps/api/.env.example). Frontend: `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL`
(default `http://localhost:3001`).
