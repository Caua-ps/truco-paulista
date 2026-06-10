# Plano de escalabilidade

## Estado atual (MVP — 1 instância de API)

Salas e filas de matchmaking vivem em memória no processo da API. PostgreSQL e
Redis já são externos. Isso atende confortavelmente os primeiros milhares de
usuários (uma partida de truco gera poucas mensagens/segundo).

## Fase de crescimento (multi-instância)

O desenho já separa as responsabilidades para escalar em três eixos
independentes:

### 1. API REST (stateless) — escala horizontal trivial
Auth, perfis, ranking e loja não guardam estado de processo. Basta colocar
N réplicas atrás de um load balancer.

### 2. Servidores de jogo (stateful) — sticky por sala
O estado de uma partida precisa morar em um único nó por vez:

- **Adapter Redis do Socket.IO** (`@socket.io/redis-adapter`) para broadcast
  entre nós e suporte a reconexão em qualquer réplica.
- **Roteamento por sala**: `roomId → instância` registrado no Redis. O load
  balancer usa sticky session (cookie/iphash) e, no handshake, a instância
  errada redireciona o cliente para a dona da sala.
- **Snapshot de estado**: serializar `GameState` no Redis a cada ação
  (é JSON puro — o motor foi desenhado para isso). Failover de um nó =
  outra instância carrega o snapshot e segue a partida.
- Alternativa quando o tráfego justificar: extrair o gateway de jogo para um
  serviço próprio (`apps/game-server`), mantendo a API REST separada — o
  monorepo já permite, pois ambos dependem só de `@truco/game-core`.

### 3. Matchmaking — worker único sobre Redis
Mover as filas de memória para sorted sets no Redis (score = rating) com um
worker dedicado de pareamento (ou lock distribuído `SETNX` para eleger líder).
A lógica de janela de rating progressiva já existe e é portável.

## Banco de dados

- Índices já modelados para as consultas quentes (ranking, histórico, presença).
- Réplicas de leitura para ranking/perfis/histórico (tolerância a lag).
- `MatchEvent` cresce rápido: particionar por mês e arquivar partidas antigas
  em storage frio (S3) após 90 dias, mantendo só o resumo no Postgres.
- Cache de ranking no Redis (já implementado, TTL 60s) elimina a consulta N+1
  do leaderboard.

## Latência e tempo real

- Heartbeat de presença a cada 30s; TTL 90s (3 perdas = offline).
- Reconexão com retomada de sessão já implementada (60s de tolerância).
- Para público multi-região: um cluster de jogo por região (BR-Sul primeiro),
  matchmaking por região, e o Postgres central apenas para persistência
  assíncrona de resultados.

## Observabilidade (pré-requisito para escalar)

- Logs estruturados (pino) + correlação por matchId/userId.
- Métricas: partidas ativas, p50/p99 de eco do WS, profundidade das filas de
  matchmaking, taxa de W.O. (proxy de problemas de rede).
- Alertas de saturação de event loop nos nós de jogo (sinal para repartir salas).

## Resumo da ordem de execução

| Gatilho | Ação |
|---|---|
| ~2–5k simultâneos | Réplicas da API REST + adapter Redis no Socket.IO |
| Filas lentas no horário de pico | Matchmaking via Redis com worker dedicado |
| Nó de jogo saturado | Snapshots no Redis + sharding de salas por instância |
| `MatchEvent` > dezenas de GB | Particionamento mensal + arquivamento frio |
| Expansão geográfica | Clusters de jogo regionais |
