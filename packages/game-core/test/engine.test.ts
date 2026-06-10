import { describe, expect, it } from 'vitest';
import {
  applyAction,
  Card,
  createGame,
  dealHand,
  GameEvent,
  GameState,
  mulberry32,
  resolveHandWinner,
  TrucoError,
  viewFor,
} from '../src/index.js';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

/** Sobrescreve a mão corrente com cartas controladas para testes determinísticos. */
function rigHand(
  state: GameState,
  opts: { vira: Card; hands: Card[][]; firstSeat?: number },
): void {
  const hand = state.hand!;
  hand.vira = opts.vira;
  hand.hands = opts.hands.map((h) => [...h]);
  const first = opts.firstSeat ?? 0;
  hand.firstSeat = first;
  hand.currentTurnSeat = first;
  hand.roundLeaderSeat = first;
}

function newGame1v1() {
  const { state } = createGame({ mode: '1v1', playerIds: ['alice', 'bob'], rng: mulberry32(1) });
  return state;
}

const play = (state: GameState, seat: number, cardIndex = 0, faceDown = false) =>
  applyAction(state, { type: 'PLAY_CARD', seat, cardIndex, faceDown }, mulberry32(99));

describe('resolveHandWinner', () => {
  it('cobre as regras de empate do Paulista', () => {
    expect(resolveHandWinner([0])).toBe('continue');
    expect(resolveHandWinner([null])).toBe('continue');
    expect(resolveHandWinner([0, 0])).toBe(0);
    expect(resolveHandWinner([0, 1])).toBe('continue');
    expect(resolveHandWinner([null, 1])).toBe(1); // empata 1ª, quem ganha a 2ª leva
    expect(resolveHandWinner([0, null])).toBe(0); // ganha 1ª, empata 2ª → leva a 1ª
    expect(resolveHandWinner([null, null])).toBe('continue');
    expect(resolveHandWinner([null, null, 1])).toBe(1);
    expect(resolveHandWinner([0, 1, null])).toBe(0); // empate na 3ª → vence quem fez a 1ª
    expect(resolveHandWinner([0, 1, 1])).toBe(1);
    expect(resolveHandWinner([null, null, null])).toBe(null); // empacha: ninguém pontua
  });
});

describe('mão simples 1v1', () => {
  it('vencedor de duas rodadas leva 1 ponto', () => {
    const state = newGame1v1();
    rigHand(state, {
      vira: c('7', 'copas'), // manilha = Q
      hands: [
        [c('3', 'espadas'), c('2', 'espadas'), c('A', 'espadas')],
        [c('4', 'ouros'), c('5', 'ouros'), c('6', 'ouros')],
      ],
    });
    play(state, 0); // 3♠
    play(state, 1); // 4♦ — time 0 vence a rodada
    play(state, 0); // 2♠
    const events = play(state, 1);
    expect(state.scores).toEqual([1, 0]);
    expect(events.some((e: GameEvent) => e.type === 'HAND_ENDED')).toBe(true);
    // Nova mão foi distribuída automaticamente.
    expect(state.hand).not.toBeNull();
  });

  it('empate na 1ª: quem ganha a 2ª leva a mão', () => {
    const state = newGame1v1();
    rigHand(state, {
      vira: c('7', 'copas'),
      hands: [
        [c('3', 'espadas'), c('4', 'paus'), c('5', 'paus')],
        [c('3', 'ouros'), c('2', 'ouros'), c('6', 'ouros')],
      ],
    });
    play(state, 0); // 3♠
    play(state, 1); // 3♦ — empate; líder continua o assento 0
    expect(state.hand!.roundResults).toEqual([null]);
    expect(state.hand!.currentTurnSeat).toBe(0);
    play(state, 0); // 4♣
    play(state, 1); // 2♦ — time 1 vence a 2ª e leva a mão
    expect(state.scores).toEqual([0, 1]);
  });

  it('vencedor da rodada abre a próxima', () => {
    const state = newGame1v1();
    rigHand(state, {
      vira: c('7', 'copas'),
      hands: [
        [c('4', 'paus'), c('3', 'espadas'), c('5', 'paus')],
        [c('A', 'ouros'), c('2', 'ouros'), c('6', 'ouros')],
      ],
    });
    play(state, 0); // 4♣
    play(state, 1); // A♦ — time 1 vence; assento 1 abre a 2ª rodada
    expect(state.hand!.currentTurnSeat).toBe(1);
  });

  it('rejeita jogada fora da vez', () => {
    const state = newGame1v1();
    const wrongSeat = (state.hand!.currentTurnSeat + 1) % 2;
    expect(() => play(state, wrongSeat)).toThrowError(TrucoError);
  });
});

describe('truco e aumentos', () => {
  function rigSimple(state: GameState) {
    rigHand(state, {
      vira: c('7', 'copas'),
      hands: [
        [c('3', 'espadas'), c('2', 'espadas'), c('A', 'espadas')],
        [c('4', 'ouros'), c('5', 'ouros'), c('6', 'ouros')],
      ],
    });
  }

  it('truco aceito eleva a mão para 3 pontos', () => {
    const state = newGame1v1();
    rigSimple(state);
    applyAction(state, { type: 'CALL_TRUCO', seat: 0 });
    expect(state.hand!.phase).toBe('trucoPending');
    applyAction(state, { type: 'RESPOND_TRUCO', seat: 1, response: 'accept' });
    expect(state.hand!.stake).toBe(3);
    play(state, 0);
    play(state, 1);
    play(state, 0);
    play(state, 1);
    expect(state.scores).toEqual([3, 0]);
  });

  it('correr do truco entrega o valor anterior ao aumento', () => {
    const state = newGame1v1();
    rigSimple(state);
    applyAction(state, { type: 'CALL_TRUCO', seat: 0 });
    applyAction(state, { type: 'RESPOND_TRUCO', seat: 1, response: 'run' }, mulberry32(7));
    expect(state.scores).toEqual([1, 0]);
  });

  it('cadeia de aumentos 3→6 aceita vale 6', () => {
    const state = newGame1v1();
    rigSimple(state);
    applyAction(state, { type: 'CALL_TRUCO', seat: 0 }); // propõe 3
    applyAction(state, { type: 'RESPOND_TRUCO', seat: 1, response: 'raise' }); // propõe 6
    applyAction(state, { type: 'RESPOND_TRUCO', seat: 0, response: 'accept' });
    expect(state.hand!.stake).toBe(6);
  });

  it('quem fez o último aumento não pode pedir o próximo', () => {
    const state = newGame1v1();
    rigSimple(state);
    applyAction(state, { type: 'CALL_TRUCO', seat: 0 });
    applyAction(state, { type: 'RESPOND_TRUCO', seat: 1, response: 'accept' });
    expect(() => applyAction(state, { type: 'CALL_TRUCO', seat: 0 })).toThrowError(/último aumento/);
  });

  it('não permite aumentar além de 12', () => {
    const state = newGame1v1();
    rigSimple(state);
    applyAction(state, { type: 'CALL_TRUCO', seat: 0 }); // 3
    applyAction(state, { type: 'RESPOND_TRUCO', seat: 1, response: 'raise' }); // 6
    applyAction(state, { type: 'RESPOND_TRUCO', seat: 0, response: 'raise' }); // 9
    applyAction(state, { type: 'RESPOND_TRUCO', seat: 1, response: 'raise' }); // 12
    expect(() =>
      applyAction(state, { type: 'RESPOND_TRUCO', seat: 0, response: 'raise' }),
    ).toThrowError(/12/);
  });
});

describe('mão de onze', () => {
  function gameAtEleven(): GameState {
    const state = newGame1v1();
    state.scores = [11, 5];
    state.hand = null;
    dealHand(state, mulberry32(3));
    return state;
  }

  it('entra em fase de decisão e vale 3 se aceita', () => {
    const state = gameAtEleven();
    expect(state.hand!.phase).toBe('maoDeOnzeDecision');
    expect(state.hand!.stake).toBe(3);
    applyAction(state, { type: 'MAO_DE_ONZE_DECISION', seat: 0, play: true });
    expect(state.hand!.phase).toBe('playing');
  });

  it('correr da mão de onze dá 1 ponto ao adversário', () => {
    const state = gameAtEleven();
    applyAction(state, { type: 'MAO_DE_ONZE_DECISION', seat: 0, play: false }, mulberry32(5));
    expect(state.scores).toEqual([11, 6]);
  });

  it('o adversário não decide a mão de onze, e truco é proibido', () => {
    const state = gameAtEleven();
    expect(() =>
      applyAction(state, { type: 'MAO_DE_ONZE_DECISION', seat: 1, play: false }),
    ).toThrowError(TrucoError);
    applyAction(state, { type: 'MAO_DE_ONZE_DECISION', seat: 0, play: true });
    expect(() => applyAction(state, { type: 'CALL_TRUCO', seat: 0 })).toThrowError(/onze/);
  });
});

describe('fim de jogo', () => {
  it('emite GAME_ENDED ao atingir 12 pontos', () => {
    const state = newGame1v1();
    state.scores = [11, 0];
    state.hand = null;
    dealHand(state, mulberry32(3));
    applyAction(state, { type: 'MAO_DE_ONZE_DECISION', seat: 0, play: true });
    rigHand(state, {
      vira: c('7', 'copas'),
      hands: [
        [c('Q', 'paus'), c('Q', 'copas'), c('A', 'espadas')],
        [c('4', 'ouros'), c('5', 'ouros'), c('6', 'ouros')],
      ],
    });
    play(state, 0);
    play(state, 1);
    play(state, 0);
    const events = play(state, 1);
    expect(state.winnerTeam).toBe(0);
    expect(state.scores[0]).toBe(12);
    expect(events.some((e: GameEvent) => e.type === 'GAME_ENDED')).toBe(true);
    // Partida encerrada: nenhuma ação adicional é aceita.
    expect(() => play(state, 0)).toThrowError(/terminou/);
  });
});

describe('2v2 e visão por jogador', () => {
  it('alterna equipes por assento e oculta cartas adversárias', () => {
    const { state } = createGame({
      mode: '2v2',
      playerIds: ['a', 'b', 'c', 'd'],
      rng: mulberry32(10),
    });
    expect(state.players.map((p) => p.team)).toEqual([0, 1, 0, 1]);

    const view = viewFor(state, 0);
    expect(view.hand!.myCards).toHaveLength(3);
    expect(view.hand!.handCounts).toEqual([3, 3, 3, 3]);
    // A visão não expõe as mãos dos demais.
    expect(JSON.stringify(view)).not.toContain('"hands"');
  });

  it('carta coberta não vence nenhuma carta e fica oculta para adversários', () => {
    const { state } = createGame({
      mode: '2v2',
      playerIds: ['a', 'b', 'c', 'd'],
      rng: mulberry32(11),
    });
    rigHand(state, {
      vira: c('7', 'copas'),
      hands: [
        [c('3', 'espadas'), c('4', 'paus'), c('5', 'paus')],
        [c('3', 'ouros'), c('4', 'copas'), c('5', 'copas')],
        [c('2', 'espadas'), c('4', 'espadas'), c('6', 'paus')],
        [c('2', 'ouros'), c('4', 'ouros'), c('6', 'copas')],
      ],
    });
    // 1ª rodada normal para liberar carta coberta na 2ª.
    play(state, 0); // 3♠
    play(state, 1); // 3♦
    play(state, 2); // 2♠
    play(state, 3); // 2♦ — empate geral (rodada 1 = null)
    expect(state.hand!.roundResults).toEqual([null]);

    play(state, 0, 0, true); // 4♣ coberta
    const opponentView = viewFor(state, 1);
    expect(opponentView.hand!.table[0]!.card).toBeNull();
    expect(opponentView.hand!.table[0]!.faceDown).toBe(true);
    const ownView = viewFor(state, 0);
    expect(ownView.hand!.table[0]!.card).toEqual(c('4', 'paus'));

    play(state, 1, 0); // 4♥ normal vence a coberta
    play(state, 2, 0); // 4♠
    play(state, 3, 0); // 4♦ — empate entre os 4s abertos? Não: coberta perde, 4s abertos empatam entre times → null
    expect(state.hand!.roundResults).toEqual([null, null]);
  });
});
