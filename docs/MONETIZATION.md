# Estratégia de monetização

Princípio inegociável: **free-to-play justo**. Dinheiro nunca compra vantagem
competitiva — apenas remove anúncios e adiciona cosméticos/conveniências.

## 1. Publicidade (usuários não-Premium)

Regras de exibição — implementadas no servidor (`GET /store/ad-eligibility/:matchId`):

- Anúncio **somente entre partidas**, nunca durante o gameplay.
- Nunca interrompe ou bloqueia ação do jogador.
- **Máximo de 1 anúncio por partida concluída** — garantido por chave
  idempotente no Redis (`SET NX`); o cliente pergunta ao servidor antes de
  exibir, então nem um cliente modificado consegue "liberar" anúncios extras,
  e um cliente honesto nunca mostra dois.
- Partida abandonada/não concluída = sem anúncio.
- Formato sugerido: intersticial recompensado opcional (assistir = +moedas),
  que monetiza melhor e é percebido como justo.

## 2. Premium (assinatura)

| Plano | Preço sugerido (BR) | Observação |
|---|---|---|
| Mensal | R$ 9,90 | porta de entrada |
| Anual | R$ 79,90 | ~33% de desconto, melhora retenção |
| Vitalício | R$ 149,90 | opcional; bom para early adopters |

Benefícios (zero impacto competitivo):
- Remoção total de anúncios, em qualquer situação.
- Selo ★ Premium no perfil.
- Estatísticas avançadas (desempenho por manilha, taxa de truco aceito, etc.).
- Histórico detalhado e replays ilimitados.

Implementação: estado `premiumUntil`/`premiumLifetime` no usuário; modelo
`Subscription` registra o vínculo com o provedor. A confirmação real entra por
**webhook assinado** do provedor (Stripe/Mercado Pago — Pix é essencial no
Brasil); o endpoint de sandbox atual (`POST /store/premium/subscribe`) será
substituído por esse webhook.

## 3. Loja cosmética (moeda virtual)

- Moedas ganhas jogando (missões diárias/semanais) e compráveis em pacotes.
- Catálogo: avatares, molduras de perfil, temas de mesa, versos de carta,
  pacotes de emojis, efeitos visuais (ex.: "Zap em Chamas").
- Raridades (comum → lendário) e rotação semanal de vitrine criam recorrência.
- Itens sazonais (temporadas ranqueadas, festa junina, etc.).

## Métricas para acompanhar

- ARPDAU separado por fonte (ads / assinatura / loja).
- Conversão free→Premium e churn mensal da assinatura.
- eCPM dos intersticiais vs. recompensados.
- % de partidas concluídas (saúde do funil de anúncios).
