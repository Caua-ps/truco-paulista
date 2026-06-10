# Arquitetura — Truco Paulista Online

## Visão geral

```
┌─────────────────────────────┐        ┌──────────────────────────────────┐
│   apps/web (Next.js, PWA)   │        │  futuro: apps/mobile (React      │
│   Tailwind, App Router      │        │  Native / Expo)                  │
└──────────┬──────────────────┘        └────────────┬─────────────────────┘
           │ REST (auth, perfil,                    │
           │ ranking, loja)                         │ mesma API + mesmo
           │ WebSocket /game                        │ pacote @truco/game-core
           ▼                                        ▼
┌──────────────────────────────────────────────────────────────┐
│                    apps/api (NestJS)                         │
│  ┌─────────┐ ┌────────┐ ┌─────────┐ ┌────────┐ ┌─────────┐  │
│  │  auth   │ │ users  │ │ friends │ │ranking │ │  store  │  │
│  └─────────┘ └────────┘ └─────────┘ └────────┘ └─────────┘  │
│  ┌─────────┐ ┌──────────────────────────────────────────┐   │
│  │  admin  │ │ game: gateway WS + rooms + matchmaking + │   │
│  └─────────┘ │ persistence  ← usa @truco/game-core      │   │
│              └──────────────────────────────────────────┘   │
└──────────┬─────────────────────────────┬─────────────────────┘
           ▼                             ▼
   ┌──────────────┐              ┌──────────────┐
   │ PostgreSQL   │              │    Redis     │
   │ (Prisma ORM) │              │ presença,    │
   │              │              │ cache, filas │
   └──────────────┘              └──────────────┘
```

## Decisão central: motor de jogo isolado (`packages/game-core`)

Toda a regra do Truco Paulista vive em um pacote TypeScript **puro, sem
dependências e sem I/O**: baralho, manilhas pela vira, força de cartas,
rodadas/empates, escada de apostas (1→3→6→9→12), mão de onze/ferro e fim de
jogo. O motor é uma máquina de estados: `applyAction(state, action) → events`.

Por que isso importa:

1. **Anti-trapaça** — o servidor é o único dono do `GameState`. Os clientes
   recebem apenas `viewFor(state, seat)`: suas cartas, contagens dos demais e a
   mesa (cartas cobertas saem como `null` para adversários). O assento usado em
   cada ação vem do usuário autenticado no socket, nunca do payload.
2. **Reuso mobile** — o app React Native importará o mesmo pacote para
   renderização otimista e validação local, sem reescrever regra alguma.
3. **Testabilidade** — 23 testes de unidade cobrem as regras com RNG semeado
   (mulberry32), sem rede nem banco.
4. **Replay/auditoria** — todo evento do motor é persistido em `MatchEvent`
   com sequência; qualquer partida pode ser reproduzida do zero.

## Backend (NestJS)

- **REST** para tudo que não é tempo real: auth, perfis, amigos, ranking,
  loja, admin. Validação com `class-validator` (whitelist + forbid).
- **WebSocket (Socket.IO, namespace `/game`)** para o jogo: salas, fila de
  matchmaking, ações de jogo, chat e emojis. Handshake autenticado por JWT.
- **Fluxo de uma partida**:
  1. `room:create`/`room:join` (sala privada por código) ou `queue:join`
     (matchmaking automático; ranqueada pareia por rating com janela que
     alarga com o tempo de espera).
  2. Todos prontos → `createGame()` no servidor, `Match` criado no banco.
  3. Cada `game:action` é validada pelo motor; eventos são persistidos e
     transmitidos; cada jogador recebe sua visão individual.
  4. Queda de conexão → 60s para reconectar (o socket retoma sala e estado);
     sem retorno = derrota por W.O. Abandono explícito = W.O. imediato.
  5. Fim de jogo → placar, XP e Elo (ranqueada) aplicados transacionalmente.
- **Redis**: presença online (TTL + heartbeat), cache de ranking (60s) e
  controle "1 anúncio por partida" (SET NX).

## Frontend (Next.js App Router)

- `lib/auth-store.ts` — sessão (zustand persistido) com par de tokens.
- `lib/api.ts` — fetch com refresh automático de token em 401 (single-flight).
- `lib/socket.ts` — singleton Socket.IO com reconexão infinita + heartbeat.
- Telas: landing, login/cadastro (+ Google), lobby (filas/salas), mesa
  (jogo completo com chat), ranking, perfil (estatísticas + histórico), loja.
- PWA: manifest + ícone; service worker entra na Fase 2 (next-pwa/serwist).

## Caminho para mobile (React Native)

- `@truco/game-core` é CommonJS puro → funciona no Metro sem ajustes.
- A API é a mesma (REST + Socket.IO têm clientes RN maduros).
- Reescrever apenas a camada de UI; `lib/` (api, socket, store) é portável com
  mudanças mínimas (storage do zustand → AsyncStorage).

## Segurança

- Senhas: bcrypt (custo 12); comparação em tempo constante contra hash dummy.
- Access token JWT de 15 min; refresh token opaco de 30 dias, armazenado só
  como SHA-256, com **rotação a cada uso** e revogação em logout/troca de senha/ban.
- Tokens de e-mail (verificação/reset) idem: hash, expiração, uso único.
- Rate limiting global (100 req/min) + limites agressivos em login/registro/
  forgot-password; rate limit de chat no gateway.
- OAuth Google: tokens entregues ao front via fragment `#` (não vai a logs).
- CORS restrito ao `WEB_ORIGIN`; DTOs com whitelist (payload extra = 400).
