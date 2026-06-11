// Smoke test do fluxo social: amizade → mensagem direta → convite para a mesa.
import { io } from 'socket.io-client';

const API = 'http://localhost:3001';

async function register(suffix) {
  const username = `social_${suffix}_${Date.now() % 1e7}`;
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email: `${username}@teste.dev`, password: 'senha12345' }),
  });
  if (!res.ok) throw new Error(`register falhou: ${res.status}`);
  const data = await res.json();
  return { id: data.user.id, username, token: data.tokens.accessToken };
}

const apiCall = (token, path, opts = {}) =>
  fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts.headers },
  }).then(async (r) => {
    if (!r.ok) throw new Error(`${path} → ${r.status}: ${await r.text()}`);
    return r.json();
  });

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(`${API}/game`, { auth: { token }, transports: ['websocket'] });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
    setTimeout(() => reject(new Error('timeout de conexão')), 5000);
  });
}

const emit = (socket, event, body) => new Promise((r) => socket.emit(event, body, r));

// 1. Duas contas que viram amigas
const ana = await register('ana');
const beto = await register('beto');

await apiCall(ana.token, '/friends/requests', {
  method: 'POST',
  body: JSON.stringify({ username: beto.username }),
});
const pending = await apiCall(beto.token, '/friends/requests');
await apiCall(beto.token, `/friends/requests/${pending[0].id}/respond`, {
  method: 'POST',
  body: JSON.stringify({ accept: true }),
});
console.log('amizade aceita ✔');

// 2. DM em tempo real
const sAna = await connect(ana.token);
const sBeto = await connect(beto.token);

const dmReceived = new Promise((r) => sBeto.once('dm:message', r));
const sent = await emit(sAna, 'dm:send', { toUserId: beto.id, text: 'bora trucar?' });
if (!sent.ok) throw new Error(`dm:send falhou: ${sent.error}`);
const dm = await dmReceived;
console.log(`dm recebida por beto: "${dm.text}" de @${dm.fromUsername} ✔`);

// 3. Histórico + não-lidas persistidos
const unread = await apiCall(beto.token, '/friends/messages/unread');
if (unread[ana.id] !== 1) throw new Error(`não-lidas esperava 1, veio ${JSON.stringify(unread)}`);
console.log('contador de não-lidas ✔');
const history = await apiCall(beto.token, `/friends/${ana.id}/messages`);
if (history.length !== 1 || history[0].text !== 'bora trucar?') throw new Error('histórico inconsistente');
const unreadAfter = await apiCall(beto.token, '/friends/messages/unread');
if (unreadAfter[ana.id] !== undefined) throw new Error('histórico não marcou como lida');
console.log('histórico marca como lida ✔');

// 4. Convite direto: ana cria mesa e convida beto
const created = await emit(sAna, 'room:create', { mode: '1v1', isPrivate: true });
const inviteReceived = new Promise((r) => sBeto.once('invite:received', r));
const inviteRes = await emit(sAna, 'invite:send', { toUserId: beto.id });
if (!inviteRes.ok) throw new Error(`invite:send falhou: ${inviteRes.error}`);
const invite = await inviteReceived;
if (invite.code !== created.code) throw new Error('código do convite não bate com a sala');
console.log(`convite recebido por beto para a mesa ${invite.code} (de ${invite.fromName}) ✔`);

// 5. Beto aceita entrando na sala
const join = await emit(sBeto, 'room:join', { code: invite.code });
if (!join.ok) throw new Error(`room:join via convite falhou: ${join.error}`);
console.log('beto sentou na mesa via convite ✔');

// 6. Recusa notifica o remetente
const declined = new Promise((r) => sAna.once('invite:declined', r));
await emit(sBeto, 'invite:decline', { toUserId: ana.id });
await declined;
console.log('recusa notificada ao remetente ✔');

console.log('✅ Smoke test social passou');
sAna.disconnect();
sBeto.disconnect();
process.exit(0);
