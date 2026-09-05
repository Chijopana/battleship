const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

// Orígenes permitidos. En producción se pueden añadir con ALLOWED_ORIGINS="https://a.com,https://b.com"
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'https://battleship-web-game.netlify.app',
  ...(process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean),
];

const corsOptions = {
  origin(origin, callback) {
    // Peticiones sin origin (curl, apps nativas, health checks) siempre permitidas
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    console.warn(`[CORS] Origin bloqueado: ${origin}`);
    return callback(new Error('Origin no permitido'), false);
  },
  methods: ['GET', 'POST'],
  credentials: true,
};

const io = new Server(server, {
  cors: corsOptions,
  transports: ['websocket', 'polling'],
  pingInterval: 15000,
  pingTimeout: 60000,
  maxHttpBufferSize: 1e6,
});

// ----------------- CONSTANTES DE JUEGO -----------------
const BOARD_SIZE = 10;
const SHIP_SIZES = [5, 4, 3, 3, 2];
const TOTAL_SHIPS = SHIP_SIZES.length;

const GAME_TTL_MS = 1000 * 60 * 30;              // 30 min sin nadie -> se borra la sala
const DISCONNECTION_GRACE_PERIOD = 60 * 1000;    // 60 s para reconectar
const SESSION_TTL_MS = 1000 * 60 * 60;           // 1 h de vida para una sesión huérfana
const MAX_GAMES = 500;                           // tope defensivo de salas simultáneas

// ----------------- RATE LIMITING -----------------
const playerActivity = new Map();
const RATE_LIMIT_WINDOW = 1000;
// Guarda contra floods de eventos. La alternancia de turnos ya impide disparar dos veces seguidas,
// así que este límite solo frena a un cliente malicioso emitiendo en bucle.
const MAX_SHOTS_PER_WINDOW = Number(process.env.MAX_SHOTS_PER_SECOND) || 8;

const checkRateLimit = (playerId) => {
  const now = Date.now();
  const times = (playerActivity.get(playerId) || []).filter(t => t > now - RATE_LIMIT_WINDOW);
  if (times.length >= MAX_SHOTS_PER_WINDOW) {
    playerActivity.set(playerId, times);
    return false;
  }
  times.push(now);
  playerActivity.set(playerId, times);
  return true;
};

// ----------------- ESTADO -----------------
const games = new Map();
const sessionMap = new Map(); // sessionId -> { gameId, playerId, createdAt }

const validId = (id) => typeof id === 'string' && /^[A-Z0-9_-]{1,32}$/i.test(id.trim());

const makeGameIfNotExists = (id) => {
  if (!games.has(id)) {
    if (games.size >= MAX_GAMES) throw new Error('Servidor saturado, inténtalo más tarde');
    games.set(id, {
      id,
      players: [],            // [playerId]
      playerSessions: {},     // playerId -> sessionId
      fleets: {},             // playerId -> { ships, shotsReceived:Set, shotsFired:[] }
      ready: {},              // playerId -> true
      turn: null,
      createdAt: Date.now(),
      ttlTimer: null,
      gameOver: false,
      winner: null,
      disconnected: {},       // playerId -> { ts, timer }
      restartRequests: {},    // playerId -> true
    });
  }
  return games.get(id);
};

/**
 * Valida la flota que envía el cliente. Impide tableros trucados
 * (barcos de menos, solapados, fuera del tablero o de tamaño incorrecto).
 */
const validateFleet = (ships) => {
  if (!Array.isArray(ships) || ships.length !== TOTAL_SHIPS) return 'Flota inválida';

  const expected = [...SHIP_SIZES].sort((a, b) => a - b).join(',');
  const got = ships.map(s => s?.size).sort((a, b) => a - b).join(',');
  if (expected !== got) return 'Tamaños de barco inválidos';

  const occupied = new Set();
  for (const ship of ships) {
    if (!Array.isArray(ship.positions) || ship.positions.length !== ship.size) return 'Posiciones inválidas';

    for (const pos of ship.positions) {
      if (!Array.isArray(pos) || pos.length !== 2) return 'Posiciones inválidas';
      const [r, c] = pos;
      if (!Number.isInteger(r) || !Number.isInteger(c)) return 'Posiciones inválidas';
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return 'Barco fuera del tablero';
      const key = `${r},${c}`;
      if (occupied.has(key)) return 'Barcos solapados';
      occupied.add(key);
    }

    // Comprobar que el barco es una línea recta y contigua
    const rows = new Set(ship.positions.map(([r]) => r));
    const cols = new Set(ship.positions.map(([, c]) => c));
    const straight = rows.size === 1 || cols.size === 1;
    if (!straight) return 'Barco no alineado';

    const axis = rows.size === 1 ? ship.positions.map(([, c]) => c) : ship.positions.map(([r]) => r);
    const sorted = [...axis].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] !== sorted[i - 1] + 1) return 'Barco no contiguo';
    }
  }
  return null;
};

const makeFleet = (ships) => ({
  ships: ships.map(s => ({ size: s.size, positions: s.positions.map(([r, c]) => [r, c]), hits: 0 })),
  shotsReceived: new Set(), // "r,c" recibidos
  shotsFired: [],           // [{ row, col, result }]
});

/** Resuelve un disparo del atacante contra la flota del defensor. Autoridad del servidor. */
const resolveShot = (defenderFleet, row, col) => {
  const key = `${row},${col}`;
  if (defenderFleet.shotsReceived.has(key)) return { error: 'Esa casilla ya fue disparada' };
  defenderFleet.shotsReceived.add(key);

  const ship = defenderFleet.ships.find(s => s.positions.some(([r, c]) => r === row && c === col));
  if (!ship) return { result: 'agua' };

  ship.hits += 1;
  if (ship.hits === ship.size) {
    return { result: 'hundido', sunkShip: ship.positions.map(([r, c]) => [r, c]) };
  }
  return { result: 'tocado' };
};

const shipsRemaining = (fleet) => fleet.ships.filter(s => s.hits < s.size).length;

const clearGraceTimer = (game, playerId) => {
  const disc = game.disconnected[playerId];
  if (disc?.timer) clearTimeout(disc.timer);
  delete game.disconnected[playerId];
};

const destroyGame = (id) => {
  const g = games.get(id);
  if (!g) return;
  if (g.ttlTimer) clearTimeout(g.ttlTimer);
  Object.keys(g.disconnected).forEach(pid => clearGraceTimer(g, pid));
  Object.values(g.playerSessions).forEach(sid => sessionMap.delete(sid));
  games.delete(id);
  console.log(`[🧹 Cleanup] Sala ${id} eliminada`);
};

const scheduleCleanupIfEmpty = (id) => {
  const g = games.get(id);
  if (!g) return;

  const now = Date.now();
  const hasActivePlayers = g.players.some(p => !g.disconnected[p]);
  const hasPlayersInGrace = Object.values(g.disconnected)
    .some(d => now - d.ts < DISCONNECTION_GRACE_PERIOD);

  if (hasActivePlayers || hasPlayersInGrace) {
    if (g.ttlTimer) { clearTimeout(g.ttlTimer); g.ttlTimer = null; }
    return;
  }

  if (g.ttlTimer) clearTimeout(g.ttlTimer);
  g.ttlTimer = setTimeout(() => {
    const cur = games.get(id);
    if (cur && !cur.players.some(p => !cur.disconnected[p])) destroyGame(id);
  }, GAME_TTL_MS);
};

const emitPlayers = (gameId) => {
  const game = games.get(gameId);
  if (!game) return;
  io.to(gameId).emit('playerJoined', { room: gameId, players: [...game.players] });
};

const removePlayer = (game, playerId) => {
  const sessionId = game.playerSessions[playerId];
  game.players = game.players.filter(p => p !== playerId);
  delete game.fleets[playerId];
  delete game.ready[playerId];
  delete game.playerSessions[playerId];
  delete game.restartRequests[playerId];
  clearGraceTimer(game, playerId);
  if (sessionId) sessionMap.delete(sessionId);
  if (game.turn === playerId) game.turn = game.players[0] || null;
};

const removePlayerFromAllGames = (socketId) => {
  const removed = [];
  for (const [gameId, game] of games.entries()) {
    if (!game.players.includes(socketId)) continue;
    const opponentId = game.players.find(p => p !== socketId);
    removePlayer(game, socketId);
    if (opponentId) io.to(opponentId).emit('opponentLeft', { room: gameId });
    emitPlayers(gameId);
    scheduleCleanupIfEmpty(gameId);
    removed.push(gameId);
  }
  return removed;
};

/** Arranca la partida si ambos jugadores han enviado flota válida. */
const startIfBothReady = (game) => {
  const readyPlayers = game.players.filter(p => game.ready[p]);
  if (readyPlayers.length !== 2) return;

  game.gameOver = false;
  game.winner = null;
  game.turn = game.turn && game.players.includes(game.turn) ? game.turn : game.players[0];

  io.to(game.id).emit('gameStarted', { room: game.id, startedBy: game.turn });
  io.to(game.id).emit('beginTurn', { room: game.id, currentPlayer: game.turn });
  console.log(`[🎬 Start] ${game.id} empieza — turno de ${game.turn.substring(0, 8)}`);
};

// Limpieza periódica de sesiones huérfanas y actividad vieja
setInterval(() => {
  const now = Date.now();
  for (const [sid, sess] of sessionMap.entries()) {
    if (now - sess.createdAt > SESSION_TTL_MS && !games.has(sess.gameId)) sessionMap.delete(sid);
  }
  for (const [pid, times] of playerActivity.entries()) {
    if (!times.some(t => t > now - RATE_LIMIT_WINDOW * 10)) playerActivity.delete(pid);
  }
}, 60_000);

// ----------------- HTTP -----------------
app.get('/', (_req, res) => res.type('text/plain').send('Battleship socket server ✅'));
app.get('/health', (_req, res) => res.json({
  ok: true,
  uptime: Math.round(process.uptime()),
  games: games.size,
  sessions: sessionMap.size,
}));

// ----------------- SOCKET.IO -----------------
io.on('connection', (socket) => {
  console.log(`+ Conectado: ${socket.id}`);

  /** Envuelve un handler para que ningún error tumbe el proceso. */
  const safe = (name, fn) => (...args) => {
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    try {
      fn(...args);
    } catch (err) {
      console.error(`[ERROR] ${name}:`, err);
      cb?.({ error: err.message || 'Error interno' });
    }
  };

  const inferRoom = () => Array.from(socket.rooms).find(r => r !== socket.id) || null;

  // -------- JOIN GAME --------
  socket.on('joinGame', safe('joinGame', (gameIdRaw, cb) => {
    const gameId = typeof gameIdRaw === 'string' ? gameIdRaw.trim().toUpperCase() : '';
    if (!validId(gameId)) return cb?.({ error: 'ID de partida inválido' });

    const previous = removePlayerFromAllGames(socket.id);
    previous.forEach(gId => socket.leave(gId));

    const game = makeGameIfNotExists(gameId);
    const sessionId = socket.handshake.auth?.sessionId || null;

    // --- Reconexión: la sesión conocía esta sala y su antiguo playerId ---
    if (sessionId && sessionMap.has(sessionId)) {
      const sess = sessionMap.get(sessionId);
      if (sess.gameId === gameId && game.players.includes(sess.playerId)) {
        const oldId = sess.playerId;
        const newId = socket.id;

        // Migrar el jugador al nuevo socket.id
        game.players = game.players.map(p => (p === oldId ? newId : p));
        if (game.fleets[oldId]) { game.fleets[newId] = game.fleets[oldId]; delete game.fleets[oldId]; }
        if (game.ready[oldId]) { game.ready[newId] = true; delete game.ready[oldId]; }
        if (game.restartRequests[oldId]) { game.restartRequests[newId] = true; delete game.restartRequests[oldId]; }
        if (game.turn === oldId) game.turn = newId;
        if (game.winner === oldId) game.winner = newId;
        delete game.playerSessions[oldId];
        game.playerSessions[newId] = sessionId;
        clearGraceTimer(game, oldId);
        sess.playerId = newId;

        socket.join(gameId);
        const opponentId = game.players.find(p => p !== newId);
        if (opponentId) io.to(opponentId).emit('opponentReconnected', { room: gameId });

        const myFleet = game.fleets[newId];
        const oppFleet = opponentId ? game.fleets[opponentId] : null;

        socket.emit('gameState', {
          gameId,
          playerId: newId,
          sessionId,
          players: [...game.players],
          turn: game.turn,
          gameOver: game.gameOver,
          winner: game.winner,
          // Disparos que YO he hecho sobre el rival (para repintar el tablero enemigo)
          myShots: myFleet?.shotsFired ?? [],
          // Casillas que el rival ha disparado sobre mí
          incomingShots: myFleet ? [...myFleet.shotsReceived].map(k => k.split(',').map(Number)) : [],
          myShipsRemaining: myFleet ? shipsRemaining(myFleet) : TOTAL_SHIPS,
          opponentShipsRemaining: oppFleet ? shipsRemaining(oppFleet) : TOTAL_SHIPS,
        });

        emitPlayers(gameId);
        if (game.turn && !game.gameOver) {
          socket.emit('beginTurn', { room: gameId, currentPlayer: game.turn });
        }
        console.log(`[🔁 Reconnect] ${oldId.substring(0, 8)} -> ${newId.substring(0, 8)} en ${gameId}`);
        return cb?.({ success: true, reconnect: true, gameId, playerId: newId, sessionId });
      }
      // La sesión ya no aplica a esta sala
      sessionMap.delete(sessionId);
    }

    // --- Jugador nuevo ---
    if (game.players.length >= 2) return cb?.({ error: 'La partida está llena' });

    const newSessionId = `sess_${socket.id}_${Date.now()}`;
    game.players.push(socket.id);
    game.playerSessions[socket.id] = newSessionId;
    socket.join(gameId);
    sessionMap.set(newSessionId, { gameId, playerId: socket.id, createdAt: Date.now() });

    if (!game.turn) game.turn = game.players[0];
    scheduleCleanupIfEmpty(gameId);

    console.log(`[🎮 Join] ${socket.id.substring(0, 8)} -> ${gameId} (${game.players.length}/2)`);
    cb?.({ success: true, gameId, playerId: socket.id, sessionId: newSessionId, players: [...game.players] });
    emitPlayers(gameId);
  }));

  // -------- SEND BOARD (flota) --------
  socket.on('sendBoard', safe('sendBoard', ({ gameId: raw, ships } = {}, cb) => {
    const gameId = (typeof raw === 'string' && raw.trim().toUpperCase()) || inferRoom();
    const game = games.get(gameId);
    if (!game) return cb?.({ error: 'Partida no encontrada' });
    if (!game.players.includes(socket.id)) return cb?.({ error: 'No estás en esta partida' });

    const invalid = validateFleet(ships);
    if (invalid) {
      console.warn(`[⚠️ Fleet] ${socket.id.substring(0, 8)} envió flota inválida: ${invalid}`);
      return cb?.({ error: invalid });
    }

    game.fleets[socket.id] = makeFleet(ships);
    game.ready[socket.id] = true;
    cb?.({ success: true });

    startIfBothReady(game);
  }));

  // -------- PLAYER SHOT (el servidor resuelve el disparo) --------
  socket.on('playerShot', safe('playerShot', ({ gameId: raw, row, col } = {}, cb) => {
    if (!checkRateLimit(socket.id)) return cb?.({ error: 'Vas demasiado rápido, espera un momento' });

    const gameId = (typeof raw === 'string' && raw.trim().toUpperCase()) || inferRoom();
    const game = games.get(gameId);
    if (!game) return cb?.({ error: 'Partida no encontrada' });
    if (!game.players.includes(socket.id)) return cb?.({ error: 'No estás en esta partida' });
    if (game.gameOver) return cb?.({ error: 'La partida ya terminó' });
    if (game.turn !== socket.id) return cb?.({ error: 'No es tu turno' });

    if (!Number.isInteger(row) || !Number.isInteger(col) ||
        row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
      return cb?.({ error: 'Coordenadas inválidas' });
    }

    const opponentId = game.players.find(p => p !== socket.id);
    if (!opponentId) return cb?.({ error: 'Esperando rival' });

    const defenderFleet = game.fleets[opponentId];
    const attackerFleet = game.fleets[socket.id];
    if (!defenderFleet || !attackerFleet) return cb?.({ error: 'Los tableros aún no están listos' });

    const shot = resolveShot(defenderFleet, row, col);
    if (shot.error) return cb?.({ error: shot.error });

    attackerFleet.shotsFired.push({ row, col, result: shot.result });

    const defenderShipsLeft = shipsRemaining(defenderFleet);
    const allSunk = defenderShipsLeft === 0;

    const payload = {
      room: gameId,
      row,
      col,
      result: shot.result,
      sunkShip: shot.sunkShip || null,
      allSunk,
    };

    io.to(socket.id).emit('shotFeedback', {
      ...payload,
      opponentShipsRemaining: defenderShipsLeft,
      myShipsRemaining: shipsRemaining(attackerFleet),
    });

    io.to(opponentId).emit('incomingShot', {
      ...payload,
      from: socket.id,
      myShipsRemaining: defenderShipsLeft,
      opponentShipsRemaining: shipsRemaining(attackerFleet),
    });

    if (allSunk) {
      game.gameOver = true;
      game.winner = socket.id;
      game.turn = null;
      io.to(gameId).emit('gameOver', { room: gameId, winner: socket.id, loser: opponentId });
      console.log(`[🏁 GameOver] ${gameId} — gana ${socket.id.substring(0, 8)}`);
    } else {
      game.turn = opponentId;
      io.to(gameId).emit('beginTurn', { room: gameId, currentPlayer: opponentId });
    }

    cb?.({ success: true, result: shot.result });
  }));

  // -------- REQUEST RESTART --------
  socket.on('requestRestart', safe('requestRestart', (gameIdRaw, cb) => {
    const gameId = (typeof gameIdRaw === 'string' && gameIdRaw.trim().toUpperCase()) || inferRoom();
    const game = games.get(gameId);
    if (!game) return cb?.({ error: 'Partida no encontrada' });
    if (!game.players.includes(socket.id)) return cb?.({ error: 'No estás en esta partida' });
    if (game.players.length < 2) return cb?.({ error: 'No hay rival en la sala' });

    game.restartRequests[socket.id] = true;
    const opponentId = game.players.find(p => p !== socket.id);
    if (opponentId) io.to(opponentId).emit('opponentRequestsRestart', { room: gameId });

    const allWant = game.players.every(p => game.restartRequests[p]);
    if (!allWant) return cb?.({ success: true, waiting: true });

    // Reset completo: se espera que ambos vuelvan a enviar su flota con sendBoard
    game.fleets = {};
    game.ready = {};
    game.gameOver = false;
    game.winner = null;
    game.restartRequests = {};
    game.turn = game.players[Math.floor(Math.random() * game.players.length)];

    io.to(gameId).emit('gameRestarted', { room: gameId });
    console.log(`[🔄 Restart] ${gameId} reiniciada`);
    cb?.({ success: true, restarted: true });
  }));

  // -------- CANCEL RESTART --------
  socket.on('cancelRestart', safe('cancelRestart', (gameIdRaw, cb) => {
    const gameId = (typeof gameIdRaw === 'string' && gameIdRaw.trim().toUpperCase()) || inferRoom();
    const game = games.get(gameId);
    if (!game) return cb?.({ success: true });

    game.restartRequests = {};
    const opponentId = game.players.find(p => p !== socket.id);
    if (opponentId) io.to(opponentId).emit('opponentCancelledRestart', { room: gameId });
    cb?.({ success: true });
  }));

  // -------- LEAVE GAME --------
  socket.on('leaveGame', safe('leaveGame', (gameIdRaw, cb) => {
    const gameId = (typeof gameIdRaw === 'string' && gameIdRaw.trim().toUpperCase()) || inferRoom();
    const game = games.get(gameId);
    if (!game) return cb?.({ success: true });

    const opponentId = game.players.find(p => p !== socket.id);
    removePlayer(game, socket.id);
    socket.leave(gameId);

    if (opponentId) io.to(opponentId).emit('opponentLeft', { room: gameId });
    emitPlayers(gameId);
    scheduleCleanupIfEmpty(gameId);

    cb?.({ success: true });
    console.log(`[👋 Leave] ${socket.id.substring(0, 8)} dejó ${gameId}`);
  }));

  // -------- DISCONNECT --------
  socket.on('disconnect', (reason) => {
    console.log(`- Desconectado: ${socket.id} (${reason})`);
    try {
      for (const [gameId, game] of games.entries()) {
        const playerId = socket.id;
        if (!game.players.includes(playerId)) continue;

        const opponentId = game.players.find(p => p !== playerId);

        clearGraceTimer(game, playerId);
        const timer = setTimeout(() => {
          const g = games.get(gameId);
          if (!g || !g.disconnected[playerId]) return;
          removePlayer(g, playerId);
          if (opponentId && g.players.includes(opponentId)) {
            io.to(opponentId).emit('opponentLeft', { room: gameId });
          }
          emitPlayers(gameId);
          scheduleCleanupIfEmpty(gameId);
          console.log(`[👋 Grace End] ${playerId.substring(0, 8)} abandonó ${gameId}`);
        }, DISCONNECTION_GRACE_PERIOD);

        game.disconnected[playerId] = { ts: Date.now(), timer };

        if (opponentId) {
          io.to(opponentId).emit('opponentDisconnected', {
            room: gameId,
            grace: DISCONNECTION_GRACE_PERIOD / 1000,
          });
        }
        scheduleCleanupIfEmpty(gameId);
      }
    } catch (err) {
      console.error('[ERROR] disconnect:', err);
    }
  });

  socket.on('pingServer', (_payload, cb) => cb?.({ pong: true, ts: Date.now() }));
});

// Última red de seguridad: registrar en vez de morir
process.on('uncaughtException', (err) => console.error('[FATAL] uncaughtException:', err));
process.on('unhandledRejection', (err) => console.error('[FATAL] unhandledRejection:', err));

server.listen(PORT, () => {
  console.log(`🚀 Socket.IO server escuchando en :${PORT} (${IS_PROD ? 'producción' : 'desarrollo'})`);
});
