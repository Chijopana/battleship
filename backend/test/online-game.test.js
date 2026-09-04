/**
 * Tests de integración del servidor online.
 * Levanta el servidor en un puerto libre y juega partidas reales con dos clientes.
 *
 *   npm test
 */
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { io } = require('socket.io-client');

const PORT = 4123;
const URL = `http://localhost:${PORT}`;
const SERVER = path.join(__dirname, '..', 'server.js');

let child;

// --- helpers -------------------------------------------------------------

const connect = () => new Promise((resolve, reject) => {
  const s = io(URL, { transports: ['websocket'], reconnection: false, forceNew: true });
  s.once('connect', () => resolve(s));
  s.once('connect_error', reject);
});

const emit = (socket, event, payload) => new Promise((resolve) => {
  socket.emit(event, payload, resolve);
});

const waitFor = (socket, event, timeout = 3000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`Timeout esperando "${event}"`)), timeout);
  socket.once(event, (data) => { clearTimeout(t); resolve(data); });
});

/** Flota válida horizontal, un barco por fila. */
const fleet = (startCol = 0) => [5, 4, 3, 3, 2].map((size, row) => ({
  size,
  positions: Array.from({ length: size }, (_, i) => [row, startCol + i]),
}));

/** Todas las casillas ocupadas por una flota, en orden. */
const allCells = (ships) => ships.flatMap(s => s.positions);

// --- ciclo de vida -------------------------------------------------------

test.before(async () => {
  child = spawn(process.execPath, [SERVER], {
    // Límite alto: los tests disparan en ráfaga, no queremos medir el rate limiter aquí
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test', MAX_SHOTS_PER_SECOND: '1000' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', d => process.stderr.write(`[server] ${d}`));
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('El servidor no arrancó')), 8000);
    child.stdout.on('data', (d) => {
      if (d.toString().includes('escuchando')) { clearTimeout(t); resolve(); }
    });
  });
});

test.after(() => { child?.kill(); });

// --- tests ---------------------------------------------------------------

test('dos jugadores se unen y la partida arranca cuando ambos envían flota', async () => {
  const a = await connect();
  const b = await connect();

  const ra = await emit(a, 'joinGame', 'SALA01');
  const rb = await emit(b, 'joinGame', 'SALA01');
  assert.ok(ra.success, 'A debería entrar');
  assert.ok(rb.success, 'B debería entrar');
  assert.ok(ra.sessionId && rb.sessionId, 'ambos reciben sessionId');

  const started = waitFor(a, 'beginTurn');
  await emit(a, 'sendBoard', { gameId: 'SALA01', ships: fleet(0) });
  await emit(b, 'sendBoard', { gameId: 'SALA01', ships: fleet(2) });

  const turn = await started;
  assert.ok([ra.playerId, rb.playerId].includes(turn.currentPlayer), 'el turno es de un jugador real');

  a.close(); b.close();
});

test('rechaza flotas trucadas', async () => {
  const a = await connect();
  await emit(a, 'joinGame', 'SALA02');

  const pocos = await emit(a, 'sendBoard', { gameId: 'SALA02', ships: fleet(0).slice(0, 3) });
  assert.match(pocos.error, /inválida/i);

  const fuera = await emit(a, 'sendBoard', {
    gameId: 'SALA02',
    ships: [{ size: 5, positions: [[0, 6], [0, 7], [0, 8], [0, 9], [0, 10]] }, ...fleet(0).slice(1)],
  });
  assert.match(fuera.error, /fuera del tablero/i);

  const solapados = await emit(a, 'sendBoard', {
    gameId: 'SALA02',
    ships: [5, 4, 3, 3, 2].map(size => ({
      size,
      positions: Array.from({ length: size }, (_, i) => [0, i]),
    })),
  });
  assert.match(solapados.error, /solapados/i);

  a.close();
});

test('el servidor resuelve los disparos y respeta los turnos', async () => {
  const a = await connect();
  const b = await connect();
  const ra = await emit(a, 'joinGame', 'SALA03');
  await emit(b, 'joinGame', 'SALA03');

  const begun = waitFor(a, 'beginTurn');
  await emit(a, 'sendBoard', { gameId: 'SALA03', ships: fleet(0) });
  await emit(b, 'sendBoard', { gameId: 'SALA03', ships: fleet(0) });
  const { currentPlayer } = await begun;

  const first = currentPlayer === ra.playerId ? a : b;
  const second = first === a ? b : a;

  // Quien no tiene el turno no puede disparar
  const denied = await emit(second, 'playerShot', { gameId: 'SALA03', row: 9, col: 9 });
  assert.match(denied.error, /No es tu turno/i);

  // Agua: fila 9 está vacía en fleet(0)
  const feedback = waitFor(first, 'shotFeedback');
  const incoming = waitFor(second, 'incomingShot');
  await emit(first, 'playerShot', { gameId: 'SALA03', row: 9, col: 9 });
  assert.equal((await feedback).result, 'agua');
  assert.equal((await incoming).result, 'agua');

  // Tocado: (0,0) es la proa del portaaviones
  const f2 = waitFor(second, 'shotFeedback');
  await emit(second, 'playerShot', { gameId: 'SALA03', row: 0, col: 0 });
  assert.equal((await f2).result, 'tocado');

  // Coordenadas inválidas
  const bad = await emit(first, 'playerShot', { gameId: 'SALA03', row: 99, col: 0 });
  assert.match(bad.error, /inválidas/i);

  a.close(); b.close();
});

test('hundir un barco lo reporta y descuenta la flota', async () => {
  const a = await connect();
  const b = await connect();
  const ra = await emit(a, 'joinGame', 'SALA04');
  await emit(b, 'joinGame', 'SALA04');

  const begun = waitFor(a, 'beginTurn');
  await emit(a, 'sendBoard', { gameId: 'SALA04', ships: fleet(0) });
  await emit(b, 'sendBoard', { gameId: 'SALA04', ships: fleet(0) });
  const { currentPlayer } = await begun;

  const me = currentPlayer === ra.playerId ? a : b;
  const rival = me === a ? b : a;

  let last;
  for (let col = 0; col < 5; col++) {
    const fb = waitFor(me, 'shotFeedback');
    await emit(me, 'playerShot', { gameId: 'SALA04', row: 0, col });
    last = await fb;
    if (col < 4) {
      // devolver el turno con un disparo al agua
      const rfb = waitFor(rival, 'shotFeedback');
      await emit(rival, 'playerShot', { gameId: 'SALA04', row: 9, col });
      await rfb;
    }
  }

  assert.equal(last.result, 'hundido');
  assert.equal(last.sunkShip.length, 5);
  assert.equal(last.opponentShipsRemaining, 4);
  assert.equal(last.allSunk, false);

  a.close(); b.close();
});

test('la partida termina cuando se hunde toda la flota', async () => {
  const a = await connect();
  const b = await connect();
  const ra = await emit(a, 'joinGame', 'SALA05');
  await emit(b, 'joinGame', 'SALA05');

  const begun = waitFor(a, 'beginTurn');
  await emit(a, 'sendBoard', { gameId: 'SALA05', ships: fleet(0) });
  await emit(b, 'sendBoard', { gameId: 'SALA05', ships: fleet(0) });
  const { currentPlayer } = await begun;

  const me = currentPlayer === ra.playerId ? a : b;
  const rival = me === a ? b : a;
  const targets = allCells(fleet(0));

  const over = waitFor(me, 'gameOver', 8000);
  for (let i = 0; i < targets.length; i++) {
    const [row, col] = targets[i];
    const fb = waitFor(me, 'shotFeedback');
    await emit(me, 'playerShot', { gameId: 'SALA05', row, col });
    const res = await fb;
    if (res.allSunk) break;
    // Relleno en casillas vacías y siempre distintas para devolver el turno
    const rfb = waitFor(rival, 'shotFeedback');
    await emit(rival, 'playerShot', { gameId: 'SALA05', row: 8 + Math.floor(i / 10), col: i % 10 });
    await rfb;
  }

  const result = await over;
  assert.equal(result.winner, currentPlayer);

  // Ya no se puede disparar
  const after = await emit(rival, 'playerShot', { gameId: 'SALA05', row: 8, col: 8 });
  assert.match(after.error, /terminó|turno/i);

  a.close(); b.close();
});

test('el reinicio bilateral deja la partida jugable otra vez', async () => {
  const a = await connect();
  const b = await connect();
  await emit(a, 'joinGame', 'SALA06');
  await emit(b, 'joinGame', 'SALA06');

  const begun = waitFor(a, 'beginTurn');
  await emit(a, 'sendBoard', { gameId: 'SALA06', ships: fleet(0) });
  await emit(b, 'sendBoard', { gameId: 'SALA06', ships: fleet(0) });
  await begun;

  // A pide reinicio, B es avisado
  const asked = waitFor(b, 'opponentRequestsRestart');
  const r1 = await emit(a, 'requestRestart', 'SALA06');
  assert.ok(r1.waiting, 'el primero solo queda a la espera');
  await asked;

  // B acepta -> ambos reciben gameRestarted
  const restartedA = waitFor(a, 'gameRestarted');
  const restartedB = waitFor(b, 'gameRestarted');
  const r2 = await emit(b, 'requestRestart', 'SALA06');
  assert.ok(r2.restarted, 'el segundo dispara el reinicio');
  await Promise.all([restartedA, restartedB]);

  // Y la nueva ronda arranca de verdad al reenviar las flotas
  const begun2 = waitFor(a, 'beginTurn', 4000);
  await emit(a, 'sendBoard', { gameId: 'SALA06', ships: fleet(0) });
  await emit(b, 'sendBoard', { gameId: 'SALA06', ships: fleet(3) });
  const turn2 = await begun2;
  assert.ok(turn2.currentPlayer, 'la partida reiniciada reparte turno');

  a.close(); b.close();
});

test('el servidor sobrevive a una desconexión y avisa al rival', async () => {
  const a = await connect();
  const b = await connect();
  await emit(a, 'joinGame', 'SALA07');
  await emit(b, 'joinGame', 'SALA07');

  const notified = waitFor(a, 'opponentDisconnected');
  b.close();
  const info = await notified;
  assert.ok(info.grace > 0, 'se informa del periodo de gracia');

  // El servidor sigue vivo
  const pong = await emit(a, 'pingServer', null);
  assert.ok(pong.pong, 'el servidor responde después de la desconexión');

  a.close();
});

test('una sesión puede reconectarse y recuperar el estado', async () => {
  const a = await connect();
  const b = await connect();
  const ra = await emit(a, 'joinGame', 'SALA08');
  const rb = await emit(b, 'joinGame', 'SALA08');

  const begun = waitFor(a, 'beginTurn');
  await emit(a, 'sendBoard', { gameId: 'SALA08', ships: fleet(0) });
  await emit(b, 'sendBoard', { gameId: 'SALA08', ships: fleet(0) });
  const { currentPlayer } = await begun;

  const me = currentPlayer === ra.playerId ? a : b;
  const mySession = currentPlayer === ra.playerId ? ra.sessionId : rb.sessionId;

  const fb = waitFor(me, 'shotFeedback');
  await emit(me, 'playerShot', { gameId: 'SALA08', row: 0, col: 0 });
  await fb;

  me.close();
  await new Promise(r => setTimeout(r, 200));

  const back = io(URL, {
    transports: ['websocket'], reconnection: false, forceNew: true,
    auth: { sessionId: mySession },
  });
  await waitFor(back, 'connect');
  const state = waitFor(back, 'gameState');
  const res = await emit(back, 'joinGame', 'SALA08');
  assert.ok(res.reconnect, 'se reconoce como reconexión');

  const s = await state;
  assert.equal(s.myShots.length, 1, 'recupera el disparo que ya había hecho');
  assert.equal(s.myShots[0].result, 'tocado');
  assert.equal(s.opponentShipsRemaining, 5);

  back.close();
  a.close(); b.close();
});
