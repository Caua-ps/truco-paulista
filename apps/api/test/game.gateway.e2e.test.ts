import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FriendsService } from '../src/friends/friends.service';
import { GamePersistenceService } from '../src/game/game-persistence.service';
import { GameGateway } from '../src/game/game.gateway';
import { MatchmakingService } from '../src/game/matchmaking.service';
import { RoomManagerService } from '../src/game/room-manager.service';
import { RedisService } from '../src/redis/redis.service';

const JWT_SECRET = 'e2e-secret';

/** Promessa que resolve no próximo evento `name` do socket (com timeout). */
function once<T = any>(socket: Socket, name: string, ms = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout esperando "${name}"`)), ms);
    socket.once(name, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe('GameGateway (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let baseUrl: string;
  const sockets: Socket[] = [];

  // Perfis falsos resolvidos pela persistência mockada.
  const profile = (id: string) => ({
    id,
    username: id,
    displayName: id.toUpperCase(),
    avatarUrl: null,
  });

  beforeAll(async () => {
    const persistenceMock: Partial<GamePersistenceService> = {
      restoreRooms: async () => [],
      getUserSummary: async (id: string) => profile(id) as any,
      getUserRating: async () => 1000,
      createMatch: async () => 'match-id',
      appendEvents: async (_m: string, seq: number, events: unknown[]) => seq + events.length,
      saveSnapshot: async () => undefined,
      finishMatch: async () => undefined,
      abandonMatch: async () => undefined,
      saveChatMessage: async () => 'msg-id',
    };
    const redisMock: Partial<RedisService> = {
      setPresence: async () => undefined,
      clearPresence: async () => undefined,
      isOnline: async () => true,
    };
    const friendsMock: Partial<FriendsService> = {
      areFriends: async () => true,
    };

    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: JWT_SECRET })],
      providers: [
        GameGateway,
        RoomManagerService,
        MatchmakingService,
        { provide: GamePersistenceService, useValue: persistenceMock },
        { provide: RedisService, useValue: redisMock },
        { provide: FriendsService, useValue: friendsMock },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    jwt = moduleRef.get(JwtService);
    await app.init();
    await app.listen(0);

    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    for (const s of sockets) s.disconnect();
    await app?.close();
  });

  function connect(userId: string): Socket {
    const token = jwt.sign({ sub: userId, username: userId }, { secret: JWT_SECRET });
    const socket = io(`${baseUrl}/game`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });
    sockets.push(socket);
    return socket;
  }

  it('rejeita conexão sem token válido', async () => {
    const socket = io(`${baseUrl}/game`, {
      auth: { token: 'invalido' },
      transports: ['websocket'],
      forceNew: true,
    });
    sockets.push(socket);
    const err = await once(socket, 'error');
    expect(err).toMatchObject({ message: expect.any(String) });
  });

  it('cria sala, entra com 2º jogador e inicia a partida quando ambos ficam prontos', async () => {
    const host = connect('alice');
    await once(host, 'connect');
    const created = await host.emitWithAck('room:create', { mode: '1v1', isPrivate: true });
    expect(created).toMatchObject({ ok: true, code: expect.any(String) });
    const code = created.code as string;

    const guest = connect('bob');
    await once(guest, 'connect');
    const joined = await guest.emitWithAck('room:join', { code });
    expect(joined).toMatchObject({ ok: true, code });

    // Ambos ficam prontos → o jogo começa e cada um recebe sua visão.
    const hostStart = once(host, 'game:start');
    const guestStart = once(guest, 'game:start');
    const hostState = once(host, 'game:state');
    const guestState = once(guest, 'game:state');

    await host.emitWithAck('room:ready', { ready: true });
    await guest.emitWithAck('room:ready', { ready: true });

    const [hs, gs, hState, gState] = await Promise.all([hostStart, guestStart, hostState, guestState]);
    expect(hs).toMatchObject({ matchId: expect.any(String) });
    expect(gs).toMatchObject({ matchId: expect.any(String) });

    // Anti-trapaça: cada jogador só enxerga as próprias 3 cartas.
    expect((hState as any).hand.myCards).toHaveLength(3);
    expect((gState as any).hand.myCards).toHaveLength(3);
  });

  it('valida jogadas pelo motor: rejeita ação fora do turno', async () => {
    const a = connect('carol');
    const b = connect('dave');
    await Promise.all([once(a, 'connect'), once(b, 'connect')]);
    const { code } = await a.emitWithAck('room:create', { mode: '1v1', isPrivate: true });
    await b.emitWithAck('room:join', { code });

    const aState = once<any>(a, 'game:state');
    const bState = once<any>(b, 'game:state');
    await a.emitWithAck('room:ready', { ready: true });
    await b.emitWithAck('room:ready', { ready: true });
    const [sa, sb] = await Promise.all([aState, bState]);

    // Descobre quem NÃO é o da vez e tenta jogar — o motor deve recusar.
    const offTurn = sa.hand.currentTurnSeat === sa.seat ? b : a;
    const res = await offTurn.emitWithAck('game:action', {
      action: { type: 'PLAY_CARD', cardIndex: 0 },
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();

    // O jogador da vez consegue jogar normalmente.
    const onTurn = sa.hand.currentTurnSeat === sa.seat ? a : b;
    const ok = await onTurn.emitWithAck('game:action', {
      action: { type: 'PLAY_CARD', cardIndex: 0 },
    });
    expect(ok).toMatchObject({ ok: true });
  });
});
