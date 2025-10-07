const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3001;

// ----------------- PARTIDAS -----------------
const games = new Map();
const GAME_TTL_MS = 1000 * 60 * 10; // 10 minutos

// ----------------- HELPERS -----------------
const validId = (id) => typeof id === 'string' && /^[A-Z0-9_-]{1,32}$/i.test(id.trim());
const makeGameIfNotExists = (id) => {
  if (!games.has(id)) {
    games.set(id, {
      players: [],
      boards: {},
      ready: {},
      turn: null,
      createdAt: Date.now(),
      ttlTimer: null,
      history: [], // Guardar movimientos
      disconnected: {}, // Para reconexión
    });
  }
  return games.get(id);
};

const scheduleCleanupIfEmpty = (id) => {
  const g = games.get(id);
  if (!g) return;
  if (!g.players.length) {
    if (g.ttlTimer) clearTimeout(g.ttlTimer);
    g.ttlTimer = setTimeout(() => {
      if (games.get(id)?.players.length === 0) {
        games.delete(id);
        console.log(`[🧹 Cleanup] Sala ${id} eliminada por inactividad`);
      }
    }, GAME_TTL_MS);
  } else if (g.ttlTimer) {
    clearTimeout(g.ttlTimer);
    g.ttlTimer = null;
  }
};

const inferRoom = (socket) => Array.from(socket.rooms).find(r => r !== socket.id) || null;

const switchTurn = (game) => {
  if (!game.players.length) return null;
  game.turn = game.players.find(p => p !== game.turn) || game.players[0];
  return game.turn;
};

const emitPlayers = (gameId) => {
  const game = games.get(gameId);
  if (!game) return;
  io.to(gameId).emit('playerJoined', { room: gameId, players: [...game.players] });
};

// ----------------- SOCKET.IO -----------------
io.on('connection', (socket) => {
  console.log(`+ Conectado: ${socket.id}`);

  // -------- JOIN GAME --------
  socket.on('joinGame', (gameIdRaw, cb) => {
    try {
      const gameId = gameIdRaw?.trim()?.toUpperCase();
      if (!validId(gameId)) return cb?.({ error: 'gameId inválido' });

      const game = makeGameIfNotExists(gameId);

      // Reconexion
      if (game.disconnected[socket.id]) {
        game.players.push(socket.id);
        delete game.disconnected[socket.id];
        socket.join(gameId);
        emitPlayers(gameId);
        return cb?.({ success: true, reconnect: true, gameId, playerId: socket.id });
      }

      if (game.players.includes(socket.id)) return cb?.({ error: 'Ya estás en la partida' });
      if (game.players.length >= 2) return cb?.({ error: 'Partida llena' });

      game.players.push(socket.id);
      socket.join(gameId);
      if (!game.turn) game.turn = game.players[0];
      scheduleCleanupIfEmpty(gameId);

      cb?.({ success: true, gameId, playerId: socket.id });
      emitPlayers(gameId);

      if (game.players.length === 2) io.to(gameId).emit('startGame', { room: gameId, message: '¡Partida lista!' });
    } catch (err) { console.error(err); cb?.({ error: 'Error interno' }); }
  });

  // -------- SEND BOARD --------
  socket.on('sendBoard', ({ gameId: raw, board } = {}, cb) => {
    try {
      const gameId = raw?.trim()?.toUpperCase() || inferRoom(socket);
      const game = games.get(gameId);
      if (!game) return cb?.({ error: 'Partida no encontrada' });

      game.boards[socket.id] = board;
      game.ready[socket.id] = true;
      cb?.({ success: true });

      if (Object.keys(game.ready).length === 2) {
        io.to(gameId).emit('beginTurn', { room: gameId, currentPlayer: game.turn });
      }
    } catch (err) { console.error(err); cb?.({ error: 'Error interno' }); }
  });

  // -------- PLAYER SHOT --------
  socket.on('playerShot', ({ gameId: raw, row, col } = {}, cb) => {
    try {
      const gameId = raw?.trim()?.toUpperCase() || inferRoom(socket);
      const game = games.get(gameId);
      if (!game) return cb?.({ error: 'Partida no encontrada' });
      if (game.turn !== socket.id) return cb?.({ error: 'No es tu turno' });

      const opponentId = game.players.find(id => id !== socket.id);
      if (!opponentId) return cb?.({ error: 'Esperando rival' });

      // Guardar en historial
      game.history.push({ type: 'shot', player: socket.id, row, col, ts: Date.now() });

      io.to(opponentId).emit('incomingShot', { room: gameId, row, col, from: socket.id });
      cb?.({ success: true });
    } catch (err) { console.error(err); cb?.({ error: 'Error interno' }); }
  });

  // -------- SHOT RESULT --------
  socket.on('shotResult', ({ gameId: raw, result, row, col, from, allSunk } = {}, cb) => {
    try {
      const gameId = raw?.trim()?.toUpperCase() || inferRoom(socket);
      const game = games.get(gameId);
      if (!game) return cb?.({ error: 'Partida no encontrada' });

      const attackerId = from || game.players.find(p => p !== socket.id);
      if (!attackerId) return cb?.({ error: 'Atacante desconocido' });

      // Guardar en historial
      game.history.push({ type: 'result', player: socket.id, attacker: attackerId, result, row, col, allSunk, ts: Date.now() });

      io.to(attackerId).emit('shotFeedback', { room: gameId, result, row, col, allSunk });

      if (allSunk) {
        io.to(gameId).emit('gameOver', { room: gameId, winner: attackerId, loser: socket.id });
        game.turn = null;
        scheduleCleanupIfEmpty(gameId);
      } else {
        game.turn = socket.id;
        io.to(gameId).emit('beginTurn', { room: gameId, currentPlayer: socket.id });
      }
      cb?.({ success: true });
    } catch (err) { console.error(err); cb?.({ error: 'Error interno' }); }
  });

  // -------- RESTART GAME --------
  socket.on('restartGame', (gameIdRaw, cb) => {
    try {
      const gameId = gameIdRaw?.trim()?.toUpperCase() || inferRoom(socket);
      const game = games.get(gameId);
      if (!game) return cb?.({ error: 'Partida no encontrada' });

      game.boards = {};
      game.ready = {};
      game.turn = game.players[0] || null;
      game.history = [];

      io.to(gameId).emit('restartGame', { room: gameId });
      cb?.({ success: true });
    } catch (err) { console.error(err); cb?.({ error: 'Error interno' }); }
  });

  // -------- DISCONNECT --------
  socket.on('disconnect', () => {
    console.log(`- Desconectado: ${socket.id}`);
    for (const [gameId, game] of games.entries()) {
      if (!game.players.includes(socket.id)) continue;

      const opponentId = game.players.find(p => p !== socket.id);
      game.players = game.players.filter(p => p !== socket.id);
      delete game.boards[socket.id];
      delete game.ready[socket.id];
      if (game.turn === socket.id) game.turn = game.players[0] || null;

      // Guardar para reconexion
      game.disconnected[socket.id] = Date.now();

      if (opponentId) io.to(opponentId).emit('opponentLeft', { room: gameId });
      emitPlayers(gameId);

      scheduleCleanupIfEmpty(gameId);
    }
  });

  // -------- DIAGNOSTICS --------
  socket.on('pingServer', (payload, cb) => cb?.({ pong: true, ts: Date.now() }));
});

server.listen(PORT, () => console.log(`🚀 Socket.IO server listening on :${PORT}`));
