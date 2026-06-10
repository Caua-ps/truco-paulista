import { cardStrength, createDeck } from './cards';
import { Rng, shuffle } from './rng';
import {
  Card,
  GameAction,
  GameEvent,
  GameMode,
  GameState,
  HandState,
  HandSummary,
  PlayerSeat,
  PlayerView,
  StakeLevel,
  TeamId,
  TrucoError,
} from './types';

const STAKE_LADDER: readonly StakeLevel[] = [1, 3, 6, 9, 12];

export function nextStake(current: StakeLevel): StakeLevel | null {
  const idx = STAKE_LADDER.indexOf(current);
  const next = STAKE_LADDER[idx + 1];
  return next ?? null;
}

export function teamOfSeat(seat: number): TeamId {
  return (seat % 2) as TeamId;
}

export interface CreateGameOptions {
  mode: GameMode;
  /** Ids dos jogadores em ordem de assento. Equipes alternam: assentos pares = time 0, ímpares = time 1. */
  playerIds: string[];
  targetScore?: number;
  rng?: Rng;
}

export function createGame(options: CreateGameOptions): { state: GameState; events: GameEvent[] } {
  const expected = options.mode === '1v1' ? 2 : 4;
  if (options.playerIds.length !== expected) {
    throw new TrucoError('INVALID_PHASE', `Modo ${options.mode} exige ${expected} jogadores`);
  }
  const players: PlayerSeat[] = options.playerIds.map((id, seat) => ({
    id,
    seat,
    team: teamOfSeat(seat),
  }));
  const state: GameState = {
    config: { mode: options.mode, targetScore: options.targetScore ?? 12 },
    players,
    scores: [0, 0],
    dealerSeat: players.length - 1,
    hand: null,
    handHistory: [],
    winnerTeam: null,
  };
  const events = dealHand(state, options.rng ?? Math.random);
  return { state, events };
}

/** Distribui uma nova mão. Muta o estado e retorna os eventos gerados. */
export function dealHand(state: GameState, rng: Rng = Math.random): GameEvent[] {
  const deck = shuffle(createDeck(), rng);
  const n = state.players.length;
  const hands: Card[][] = [];
  for (let seat = 0; seat < n; seat++) {
    hands.push(deck.slice(seat * 3, seat * 3 + 3));
  }
  const vira = deck[n * 3] as Card;

  state.dealerSeat = (state.dealerSeat + 1) % n;
  const firstSeat = (state.dealerSeat + 1) % n;

  const t0AtEleven = state.scores[0] === state.config.targetScore - 1;
  const t1AtEleven = state.scores[1] === state.config.targetScore - 1;
  const isMaoDeFerro = t0AtEleven && t1AtEleven;
  const isMaoDeOnze = !isMaoDeFerro && (t0AtEleven || t1AtEleven);
  const maoDeOnzeTeam: TeamId | null = isMaoDeOnze ? (t0AtEleven ? 0 : 1) : null;

  state.hand = {
    vira,
    hands,
    table: [],
    roundResults: [],
    roundLeaderSeat: firstSeat,
    currentTurnSeat: firstSeat,
    firstSeat,
    stake: isMaoDeOnze ? 3 : 1,
    pendingStake: null,
    lastRaiserTeam: null,
    phase: isMaoDeOnze ? 'maoDeOnzeDecision' : 'playing',
    isMaoDeOnze,
    isMaoDeFerro,
    maoDeOnzeTeam,
  };

  return [
    {
      type: 'HAND_STARTED',
      vira,
      dealerSeat: state.dealerSeat,
      firstSeat,
      isMaoDeOnze,
      isMaoDeFerro,
    },
  ];
}

/**
 * Resolve o vencedor da mão a partir dos resultados das rodadas.
 * Retorna 'continue' se a mão ainda não terminou; null se a mão empatou de vez.
 *
 * Regras de empate do Truco Paulista:
 *  - Empata a 1ª: quem ganhar a 2ª leva (se a 2ª empatar, decide a 3ª).
 *  - Ganhou a 1ª e empata a 2ª (ou a 3ª): leva quem ganhou a 1ª.
 *  - Empatam as três: ninguém pontua.
 */
export function resolveHandWinner(results: readonly (TeamId | null)[]): TeamId | null | 'continue' {
  const wins: [number, number] = [0, 0];
  let ties = 0;
  for (const r of results) {
    if (r === null) ties++;
    else wins[r]++;
  }
  if (wins[0] >= 2) return 0;
  if (wins[1] >= 2) return 1;
  if (results.length >= 2 && ties >= 1) {
    if (wins[0] === 1 && wins[1] === 0) return 0;
    if (wins[1] === 1 && wins[0] === 0) return 1;
  }
  if (results.length === 3) {
    const firstDecided = results.find((r) => r !== null);
    return firstDecided === undefined ? null : firstDecided;
  }
  return 'continue';
}

function requireHand(state: GameState): HandState {
  if (state.winnerTeam !== null) {
    throw new TrucoError('GAME_FINISHED', 'A partida já terminou');
  }
  if (!state.hand) {
    throw new TrucoError('INVALID_PHASE', 'Nenhuma mão em andamento');
  }
  return state.hand;
}

/**
 * Aplica uma ação de jogador. Muta o estado e retorna os eventos gerados.
 * Toda validação acontece aqui — o servidor é a única fonte de verdade.
 */
export function applyAction(state: GameState, action: GameAction, rng: Rng = Math.random): GameEvent[] {
  switch (action.type) {
    case 'PLAY_CARD':
      return playCard(state, action.seat, action.cardIndex, action.faceDown ?? false, rng);
    case 'CALL_TRUCO':
      return callTruco(state, action.seat);
    case 'RESPOND_TRUCO':
      return respondTruco(state, action.seat, action.response, rng);
    case 'MAO_DE_ONZE_DECISION':
      return decideMaoDeOnze(state, action.seat, action.play, rng);
  }
}

function playCard(state: GameState, seat: number, cardIndex: number, faceDown: boolean, rng: Rng): GameEvent[] {
  const hand = requireHand(state);
  if (hand.phase !== 'playing') {
    throw new TrucoError('INVALID_PHASE', 'Não é possível jogar carta agora');
  }
  if (hand.currentTurnSeat !== seat) {
    throw new TrucoError('NOT_YOUR_TURN', 'Não é a sua vez');
  }
  const cards = hand.hands[seat];
  if (!cards || cardIndex < 0 || cardIndex >= cards.length) {
    throw new TrucoError('INVALID_CARD', 'Carta inválida');
  }
  // Carta coberta não é permitida na primeira rodada.
  const playFaceDown = faceDown && hand.roundResults.length > 0;

  const card = cards.splice(cardIndex, 1)[0] as Card;
  hand.table.push({ seat, card, faceDown: playFaceDown });

  const events: GameEvent[] = [
    { type: 'CARD_PLAYED', seat, card: playFaceDown ? null : card, faceDown: playFaceDown },
  ];

  const n = state.players.length;
  if (hand.table.length < n) {
    hand.currentTurnSeat = (seat + 1) % n;
    return events;
  }

  // Rodada completa: resolve o vencedor.
  events.push(...finishRound(state, rng));
  return events;
}

function finishRound(state: GameState, rng: Rng): GameEvent[] {
  const hand = requireHand(state);
  const vira = hand.vira;
  // Carta coberta tem força -1: perde de qualquer carta.
  const strengths = hand.table.map((p) => (p.faceDown ? -1 : cardStrength(p.card, vira)));
  const best = Math.max(...strengths);
  const bestPlays = hand.table.filter((_, i) => strengths[i] === best);
  const bestTeams = new Set(bestPlays.map((p) => teamOfSeat(p.seat)));

  let winnerTeam: TeamId | null;
  let leaderSeat: number;
  if (bestTeams.size > 1) {
    // Empate ("melou"): ninguém leva a rodada; quem abriu segue abrindo.
    winnerTeam = null;
    leaderSeat = hand.roundLeaderSeat;
  } else {
    winnerTeam = bestPlays[0] ? teamOfSeat(bestPlays[0].seat) : null;
    leaderSeat = bestPlays[0]?.seat ?? hand.roundLeaderSeat;
  }

  hand.roundResults.push(winnerTeam);
  hand.table = [];
  hand.roundLeaderSeat = leaderSeat;
  hand.currentTurnSeat = leaderSeat;

  const events: GameEvent[] = [
    { type: 'ROUND_ENDED', round: hand.roundResults.length, winnerTeam },
  ];

  const result = resolveHandWinner(hand.roundResults);
  if (result === 'continue') {
    return events;
  }

  events.push(...endHand(state, result, result === null ? 0 : hand.stake, result === null ? 'draw' : 'rounds', rng));
  return events;
}

function callTruco(state: GameState, seat: number): GameEvent[] {
  const hand = requireHand(state);
  if (hand.phase !== 'playing') {
    throw new TrucoError('INVALID_PHASE', 'Não é possível pedir truco agora');
  }
  if (hand.currentTurnSeat !== seat) {
    throw new TrucoError('NOT_YOUR_TURN', 'Só o jogador da vez pode pedir truco');
  }
  if (hand.isMaoDeOnze || hand.isMaoDeFerro) {
    throw new TrucoError('TRUCO_NOT_ALLOWED', 'Não há truco na mão de onze/ferro');
  }
  const team = teamOfSeat(seat);
  if (hand.lastRaiserTeam === team) {
    throw new TrucoError('CANNOT_RAISE', 'Sua equipe fez o último aumento; aguarde a resposta adversária');
  }
  const proposed = nextStake(hand.stake);
  if (proposed === null) {
    throw new TrucoError('CANNOT_RAISE', 'A aposta já está no máximo (12)');
  }
  hand.pendingStake = proposed;
  hand.lastRaiserTeam = team;
  hand.phase = 'trucoPending';
  return [{ type: 'TRUCO_CALLED', seat, team, proposedStake: proposed }];
}

function respondTruco(
  state: GameState,
  seat: number,
  response: 'accept' | 'run' | 'raise',
  rng: Rng,
): GameEvent[] {
  const hand = requireHand(state);
  if (hand.phase !== 'trucoPending' || hand.pendingStake === null || hand.lastRaiserTeam === null) {
    throw new TrucoError('INVALID_PHASE', 'Não há truco pendente');
  }
  const team = teamOfSeat(seat);
  if (team === hand.lastRaiserTeam) {
    throw new TrucoError('NOT_YOUR_DECISION', 'A resposta cabe à equipe adversária');
  }

  if (response === 'accept') {
    hand.stake = hand.pendingStake;
    hand.pendingStake = null;
    hand.phase = 'playing';
    return [{ type: 'TRUCO_ACCEPTED', team, stake: hand.stake }];
  }

  if (response === 'run') {
    // Quem corre entrega o valor corrente da mão (antes do aumento proposto).
    const winner = hand.lastRaiserTeam;
    const points = hand.stake;
    const events: GameEvent[] = [{ type: 'TRUCO_RUN', team }];
    events.push(...endHand(state, winner, points, 'run', rng));
    return events;
  }

  // raise: aumenta para o próximo degrau, devolvendo a decisão.
  const raised = nextStake(hand.pendingStake);
  if (raised === null) {
    throw new TrucoError('CANNOT_RAISE', 'Não é possível aumentar além de 12');
  }
  hand.stake = hand.pendingStake; // aceita implicitamente o valor anterior
  hand.pendingStake = raised;
  hand.lastRaiserTeam = team;
  return [{ type: 'TRUCO_CALLED', seat, team, proposedStake: raised }];
}

function decideMaoDeOnze(state: GameState, seat: number, play: boolean, rng: Rng): GameEvent[] {
  const hand = requireHand(state);
  if (hand.phase !== 'maoDeOnzeDecision' || hand.maoDeOnzeTeam === null) {
    throw new TrucoError('INVALID_PHASE', 'Não há decisão de mão de onze pendente');
  }
  const team = teamOfSeat(seat);
  if (team !== hand.maoDeOnzeTeam) {
    throw new TrucoError('NOT_YOUR_DECISION', 'A decisão é da equipe com 11 pontos');
  }

  if (play) {
    hand.phase = 'playing';
    return [{ type: 'MAO_DE_ONZE_ACCEPTED', team }];
  }

  // Correr da mão de onze: adversário ganha 1 ponto.
  const opponent = (1 - team) as TeamId;
  const events: GameEvent[] = [{ type: 'MAO_DE_ONZE_DECLINED', team }];
  events.push(...endHand(state, opponent, 1, 'maoDeOnzeDeclined', rng));
  return events;
}

function endHand(
  state: GameState,
  winnerTeam: TeamId | null,
  points: number,
  endedBy: HandSummary['endedBy'],
  rng: Rng,
): GameEvent[] {
  const hand = requireHand(state);
  const summary: HandSummary = {
    winnerTeam,
    pointsAwarded: winnerTeam === null ? 0 : points,
    roundResults: [...hand.roundResults],
    endedBy,
  };
  state.handHistory.push(summary);
  if (winnerTeam !== null) {
    state.scores[winnerTeam] = Math.min(state.config.targetScore, state.scores[winnerTeam] + points);
  }
  state.hand = null;

  const events: GameEvent[] = [{ type: 'HAND_ENDED', summary, scores: [...state.scores] }];

  if (winnerTeam !== null && state.scores[winnerTeam] >= state.config.targetScore) {
    state.winnerTeam = winnerTeam;
    events.push({ type: 'GAME_ENDED', winnerTeam, scores: [...state.scores] });
    return events;
  }

  events.push(...dealHand(state, rng));
  return events;
}

// ---------------------------------------------------------------------------
// Visão por jogador (anti-trapaça): nunca envie GameState bruto ao cliente.
// ---------------------------------------------------------------------------

export function viewFor(state: GameState, seat: number): PlayerView {
  const base: PlayerView = {
    config: state.config,
    players: state.players,
    scores: [...state.scores],
    dealerSeat: state.dealerSeat,
    winnerTeam: state.winnerTeam,
    seat,
    hand: null,
  };
  const hand = state.hand;
  if (!hand) return base;

  const team = teamOfSeat(seat);
  const isMyTurn = hand.currentTurnSeat === seat;
  const canRespond =
    hand.phase === 'trucoPending' && hand.lastRaiserTeam !== null && team !== hand.lastRaiserTeam;
  const canDecideMaoDeOnze = hand.phase === 'maoDeOnzeDecision' && hand.maoDeOnzeTeam === team;

  // Na mão de onze (2v2), os parceiros da equipe com 11 veem as cartas um do outro
  // durante a decisão.
  let partnerCards: Card[] | null = null;
  if (canDecideMaoDeOnze && state.config.mode === '2v2') {
    const partnerSeat = (seat + 2) % state.players.length;
    partnerCards = [...(hand.hands[partnerSeat] ?? [])];
  }

  base.hand = {
    vira: hand.vira,
    myCards: [...(hand.hands[seat] ?? [])],
    partnerCards,
    handCounts: hand.hands.map((h) => h.length),
    table: hand.table.map((p) => ({
      seat: p.seat,
      // Cartas cobertas só são visíveis para quem as jogou.
      card: p.faceDown && p.seat !== seat ? null : p.card,
      faceDown: p.faceDown,
    })),
    roundResults: [...hand.roundResults],
    currentTurnSeat: hand.currentTurnSeat,
    roundLeaderSeat: hand.roundLeaderSeat,
    firstSeat: hand.firstSeat,
    stake: hand.stake,
    pendingStake: hand.pendingStake,
    lastRaiserTeam: hand.lastRaiserTeam,
    phase: hand.phase,
    isMaoDeOnze: hand.isMaoDeOnze,
    isMaoDeFerro: hand.isMaoDeFerro,
    maoDeOnzeTeam: hand.maoDeOnzeTeam,
    canPlay: hand.phase === 'playing' && isMyTurn,
    canCallTruco:
      hand.phase === 'playing' &&
      isMyTurn &&
      !hand.isMaoDeOnze &&
      !hand.isMaoDeFerro &&
      hand.lastRaiserTeam !== team &&
      nextStake(hand.stake) !== null,
    canRespondTruco: canRespond,
    canDecideMaoDeOnze,
  };
  return base;
}
