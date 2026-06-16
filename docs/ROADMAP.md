# Roadmap de desenvolvimento

## Fase 0 — Fundação ✅ (este repositório)

- [x] Monorepo (npm workspaces) com motor, API e web.
- [x] Motor completo do Truco Paulista com 23 testes (manilhas, vira,
      empates, truco 3/6/9/12, mão de onze/ferro, carta coberta).
- [x] Modelagem completa do banco (Prisma/PostgreSQL, 19 modelos).
- [x] Auth: cadastro, login, refresh com rotação, verificação de e-mail,
      reset de senha, Google OAuth, banimento.
- [x] Multiplayer em tempo real: salas privadas por código, matchmaking
      casual/ranqueado (1v1 e 2v2), reconexão com retomada, W.O., chat,
      emojis, presença.
- [x] Persistência de partidas, eventos para replay, XP/nível, Elo.
- [x] Web: landing, auth, lobby, mesa jogável, ranking, perfil, loja.
- [x] Docker Compose, Dockerfiles, CI (GitHub Actions), seed.

## Fase 1 — MVP jogável em produção (3–4 semanas)

- [x] Scaffolding de deploy: Dockerfile já roda `prisma migrate deploy` no boot,
      `fly.toml` da API e `docs/DEPLOY.md`. (Deploy real é passo manual de ops.)
- [x] E-mail transacional real no `MailService` (nodemailer/SMTP, templates HTML).
- [x] Telemetria mínima: Sentry (`@sentry/node` + filtro global) e logs
      estruturados (nestjs-pino). Health checks `/health` e `/ready`.
- [x] Polimento da mesa: animações de distribuição/recolhimento e sons (WebAudio).
- [x] Convite por link com preview: rota `/convite/CODIGO` com OG dinâmico
      (`opengraph-image`) e prévia pública da sala (`GET /rooms/:code/preview`).
- [x] Testes e2e do gateway (vitest + socket.io-client).
- [ ] Beta fechado com amigos; ajustar timeouts/UX de reconexão. (Operacional.)

## Fase 2 — Social e retenção (4–6 semanas)

- [ ] UI de amigos (a API já existe): lista, convites, presença, convidar para mesa.
- [ ] Notificações em tempo real (convites, amigo online) + push (Web Push).
- [ ] Missões diárias/semanais ativas (modelos prontos; falta o tracker de progresso).
- [ ] Conquistas/medalhas com tracker de eventos do motor.
- [ ] Replay player na web usando `MatchEvent`.
- [ ] PWA completo: service worker, offline da casca, install prompt.
- [ ] Moderação: UI do painel admin (API pronta), filtro de palavrões no chat.

## Fase 3 — Competitivo e monetização (4–6 semanas)

- [ ] Temporadas ranqueadas (modelo `Season` pronto): reset trimestral,
      recompensas cosméticas por elo atingido.
- [ ] Pagamentos: Stripe/Mercado Pago com Pix + webhooks → Premium real.
- [ ] SDK de anúncios na web (AdSense/Ad Manager) respeitando o gate do servidor.
- [ ] Loja com vitrine rotativa e pacotes de moedas.
- [ ] Estatísticas avançadas (Premium).
- [ ] Espectador de partidas de amigos.

## Fase 4 — Mobile (6–8 semanas, em paralelo a partir da Fase 3)

- [ ] `apps/mobile` (React Native/Expo) consumindo `@truco/game-core` e a mesma API.
- [ ] Push nativo (FCM/APNs), deep links de convite.
- [ ] IAP das lojas (Google Play Billing / StoreKit) integrado ao Premium.
- [ ] Publicação nas lojas (builds EAS, review guidelines).

## Fase 5 — Escala e expansão

- [ ] Itens de docs/SCALABILITY.md conforme gatilhos de tráfego.
- [ ] Torneios agendados, mesas com espectadores, clipes de jogadas.
- [ ] Novas variantes regionais de truco — o motor isolado torna cada
      variante um módulo de regras novo, reaproveitando toda a plataforma.
