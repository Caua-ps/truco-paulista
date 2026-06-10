// Smoke test do fluxo de sala: cria 2 usuários, user1 cria a sala,
// user2 entra pelo código e depois RE-ENTRA (como a página da mesa faz).
// Antes do fix, o re-join devolvia "Sala cheia".
import { io } from 'socket.io-client';

const API = 'http://localhost:3001';

async function register(suffix) {
  const username = `smoke_${suffix}_${Date.now() % 1e7}`;
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email: `${username}@teste.dev`, password: 'senha12345' }),
  });
  if (!res.ok) throw new Error(`register falhou: ${res.status}`);
  const data = await res.json();
  return { username, token: data.tokens.accessToken };
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(`${API}/game`, { auth: { token }, transports: ['websocket'] });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
    setTimeout(() => reject(new Error('timeout de conexão')), 5000);
  });
}

const emit = (socket, event, body) =>
  new Promise((resolve) => socket.emit(event, body, resolve));

const u1 = await register('a');
const u2 = await register('b');
const s1 = await connect(u1.token);
const s2 = await connect(u2.token);

const created = await emit(s1, 'room:create', { mode: '1v1', isPrivate: true });
console.log('room:create →', JSON.stringify(created));
if (!created.ok) process.exit(1);

const join1 = await emit(s2, 'room:join', { code: created.code });
console.log('user2 room:join →', JSON.stringify(join1));
if (!join1.ok) process.exit(1);

// Re-join do user2 (o que a página /mesa faz ao montar) — era o bug.
const rejoin = await emit(s2, 'room:join', { code: created.code });
console.log('user2 RE-join →', JSON.stringify(rejoin));
if (!rejoin.ok) {
  console.error('FALHOU: re-join rejeitado:', rejoin.error);
  process.exit(1);
}

// Re-join do user1 também.
const rejoin1 = await emit(s1, 'room:join', { code: created.code });
console.log('user1 RE-join →', JSON.stringify(rejoin1));
if (!rejoin1.ok) process.exit(1);

// Ambos prontos → o jogo deve começar e cada um recebe seu estado + deadline.
const stateReceived = Promise.all([
  new Promise((r) => s1.once('game:state', (v) => r(v.seat))),
  new Promise((r) => s2.once('game:state', (v) => r(v.seat))),
]);
const deadlineReceived = new Promise((r) => s1.once('turn:deadline', r));
await emit(s1, 'room:ready', { ready: true });
await emit(s2, 'room:ready', { ready: true });
const seats = await stateReceived;
console.log('game:state recebido — assentos:', seats.join(', '));
const dl = await deadlineReceived;
console.log(`turn:deadline recebido — assento ${dl.seat}, ${Math.round((dl.deadline - Date.now()) / 1000)}s restantes`);

console.log('✅ Smoke test da sala passou');
s1.disconnect();
s2.disconnect();
process.exit(0);
