/**
 * Tipos do domínio do Truco Paulista.
 *
 * Baralho de 40 cartas (sem 8, 9 e 10/curingas), manilhas definidas pela vira,
 * mão melhor de 3 rodadas, apostas 1 → 3 (truco) → 6 → 9 → 12.
 */

export type Suit = 'ouros' | 'espadas' | 'copas' | 'paus';

export type Rank = '4' | '5' | '6' | '7' | 'Q' | 'J' | 'K' | 'A' | '2' | '3';

export interface Card {
  rank: Rank;
  suit: Suit;
}

/** Ordem de força dos ranks (fraco → forte), excluindo manilhas. */
export const RANK_ORDER: readonly Rank[] = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];

/** Ordem de força dos naipes para manilhas (fraco → forte): ouros < espadas < copas < paus (zap). */
export const MANILHA_SUIT_ORDER: readonly Suit[] = ['ouros', 'espadas', 'copas', 'paus'];

export const ALL_SUITS: readonly Suit[] = ['ouros', 'espadas', 'copas', 'paus'];

export type TeamId = 0 | 1;

export type StakeLevel = 1 | 3 | 6 | 9 | 12;

export type GameMode = '1v1' | '2v2';

export interface PlayerSeat {
  /** Identificador externo (id do usuário). */
  id: string;
  /** Assento 0..N-1; a equipe é seat % 2. */
  seat: number;
  team: TeamId;
}

export interface PlayedCard {
  seat: number;
  card: Card;
  /** Carta "coberta" (virada para baixo): não vence nenhuma carta. */
  faceDown: boolean;
}

export type HandPhase =
  /** Equipe com 11 pontos decide se joga a mão de onze. */
  | 'maoDeOnzeDecision'
  /** Jogo corrente; o jogador da vez pode jogar carta ou pedir truco/aumento. */
  | 'playing'
  /** Truco/aumento pendente; equipe adversária deve aceitar, correr ou aumentar. */
  | 'trucoPending';

export interface HandState {
  vira: Card;
  /** Cartas na mão de cada jogador, indexadas pelo assento. */
  hands: Card[][];
  /** Cartas na mesa na rodada corrente. */
  table: PlayedCard[];
  /** Resultado de cada rodada concluída: TeamId vencedor ou null (empate). */
  roundResults: (TeamId | null)[];
  /** Assento que abre a rodada corrente. */
  roundLeaderSeat: number;
  currentTurnSeat: number;
  /** Assento "mão" (primeiro a jogar na mão). */
  firstSeat: number;
  stake: StakeLevel;
  /** Valor proposto quando há truco/aumento pendente. */
  pendingStake: StakeLevel | null;
  /** Equipe que fez o último pedido aceito/pendente — não pode pedir o próximo aumento. */
  lastRaiserTeam: TeamId | null;
  phase: HandPhase;
  /** Exatamente uma equipe com 11 pontos: mão vale 3, sem truco. */
  isMaoDeOnze: boolean;
  /** Ambas as equipes com 11: mão de ferro, vale 1, sem truco. */
  isMaoDeFerro: boolean;
  maoDeOnzeTeam: TeamId | null;
}

export interface HandSummary {
  winnerTeam: TeamId | null;
  pointsAwarded: number;
  roundResults: (TeamId | null)[];
  /** Como a mão terminou. */
  endedBy: 'rounds' | 'run' | 'maoDeOnzeDeclined' | 'draw';
}

export interface GameConfig {
  mode: GameMode;
  targetScore: number;
}

export interface GameState {
  config: GameConfig;
  players: PlayerSeat[];
  scores: [number, number];
  dealerSeat: number;
  hand: HandState | null;
  handHistory: HandSummary[];
  winnerTeam: TeamId | null;
}

// ---------------------------------------------------------------------------
// Ações (entradas do jogador, validadas pelo servidor)
// ---------------------------------------------------------------------------

export type GameAction =
  | { type: 'PLAY_CARD'; seat: number; cardIndex: number; faceDown?: boolean }
  /** Pede truco (1→3) ou o próximo aumento (3→6→9→12). */
  | { type: 'CALL_TRUCO'; seat: number }
  | { type: 'RESPOND_TRUCO'; seat: number; response: 'accept' | 'run' | 'raise' }
  | { type: 'MAO_DE_ONZE_DECISION'; seat: number; play: boolean };

// ---------------------------------------------------------------------------
// Eventos (saídas para a UI/broadcast)
// ---------------------------------------------------------------------------

export type GameEvent =
  | { type: 'HAND_STARTED'; vira: Card; dealerSeat: number; firstSeat: number; isMaoDeOnze: boolean; isMaoDeFerro: boolean }
  | { type: 'CARD_PLAYED'; seat: number; card: Card | null; faceDown: boolean }
  | { type: 'ROUND_ENDED'; round: number; winnerTeam: TeamId | null }
  | { type: 'TRUCO_CALLED'; seat: number; team: TeamId; proposedStake: StakeLevel }
  | { type: 'TRUCO_ACCEPTED'; team: TeamId; stake: StakeLevel }
  | { type: 'TRUCO_RUN'; team: TeamId }
  | { type: 'MAO_DE_ONZE_ACCEPTED'; team: TeamId }
  | { type: 'MAO_DE_ONZE_DECLINED'; team: TeamId }
  | { type: 'HAND_ENDED'; summary: HandSummary; scores: [number, number] }
  | { type: 'GAME_ENDED'; winnerTeam: TeamId; scores: [number, number] };

/** Visão redigida do estado para um assento específico (anti-trapaça). */
export interface PlayerView {
  config: GameConfig;
  players: PlayerSeat[];
  scores: [number, number];
  dealerSeat: number;
  winnerTeam: TeamId | null;
  seat: number;
  hand: null | {
    vira: Card;
    /** Suas cartas (e do parceiro durante decisão de mão de onze em 2v2). */
    myCards: Card[];
    partnerCards: Card[] | null;
    /** Quantidade de cartas restantes por assento. */
    handCounts: number[];
    /** Mesa com cartas cobertas ocultadas para adversários. */
    table: { seat: number; card: Card | null; faceDown: boolean }[];
    roundResults: (TeamId | null)[];
    currentTurnSeat: number;
    roundLeaderSeat: number;
    firstSeat: number;
    stake: StakeLevel;
    pendingStake: StakeLevel | null;
    lastRaiserTeam: TeamId | null;
    phase: HandPhase;
    isMaoDeOnze: boolean;
    isMaoDeFerro: boolean;
    maoDeOnzeTeam: TeamId | null;
    /** Ações disponíveis para este assento agora. */
    canPlay: boolean;
    canCallTruco: boolean;
    canRespondTruco: boolean;
    canDecideMaoDeOnze: boolean;
  };
}

export class TrucoError extends Error {
  constructor(
    public readonly code:
      | 'NOT_YOUR_TURN'
      | 'INVALID_CARD'
      | 'INVALID_PHASE'
      | 'TRUCO_NOT_ALLOWED'
      | 'CANNOT_RAISE'
      | 'NOT_YOUR_DECISION'
      | 'GAME_FINISHED',
    message: string,
  ) {
    super(message);
    this.name = 'TrucoError';
  }
}
