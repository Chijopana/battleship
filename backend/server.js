const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Configurar CORS para Socket.IO
const corsOptions = {
  origin: function(origin, callback) {
    // Lista de orígenes permitidos
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000',
      'https://battleship-bx9q.onrender.com',
      'https://battleship-web-game.netlify.app',
    ];
    
    // En producción (Render), permitir cualquier origin que venga
    if (process.env.NODE_ENV === 'production') {
      callback(null, true);
    } else if (!origin || allowedOrigins.includes(origin)) {
      // En desarrollo, verificar contra la lista
      callback(null, true);
    } else {
      console.warn(`[CORS] Origin bloqueado: ${origin}`);
    }
  },
  methods: ['GET', 'POST'],
  credentials: true,
  allowEIO3: true
};

const io = new Server(server, {
  cors: corsOptions,
  transports: ['websocket', 'polling'],
  pingInterval: 15000,        // Ping más frecuente (15s)
  pingTimeout: 120000,         // Timeout más largo (2 min)
  maxDisconnectionDuration: 5 * 60 * 1000,  // 5 min para reconectarse
  maxHttpBufferSize: 1e6,
});

const PORT = process.env.PORT || 3001;

// ----------------- RATE LIMITING BÁSICO -----------------
const playerActivity = new Map();
const RATE_LIMIT_WINDOW = 1000; // 1 segundo
const MAX_SHOTS_PER_WINDOW = 1; // máximo 1 disparo por segundo

const checkRateLimit = (playerId) => {
  const now = Date.now();
  if (!playerActivity.has(playerId)) {
    playerActivity.set(playerId, []);
  }
  const times = playerActivity.get(playerId);
  playerActivity.set(playerId, times.filter(t => t > now - RATE_LIMIT_WINDOW));
  const current = playerActivity.get(playerId);
  
  if (current.length >= MAX_SHOTS_PER_WINDOW) return false;
  current.push(now);
  return true;
};

// Limpiar activity vieja periodicamente
setInterval(() => {
  const now = Date.now();
  for (const [pid, times] of playerActivity.entries()) {
    const filtered = times.filter(t => t > now - RATE_LIMIT_WINDOW * 10);
    if (filtered.length === 0) {
      playerActivity.delete(pid);
    } else {
      playerActivity.set(pid, filtered);
    }
  }
}, 10000);

// --------------------- PARTIDAS ---------------------
const games = new Map();
const sessionMap = new Map(); // Mapea sessionId -> {gameId, playerId, socketIds: []}
const GAME_TTL_MS = 1000 * 60 * 30; // 30 minutos
const DISCONNECTION_GRACE_PERIOD = 5 * 60 * 1000; // 5 minutos para reconectarse
const MAX_EVENT_BUFFER = 50; // Máximo de eventos a guardar

// ----------------- HELPERS -----------------
const validId = (id) => typeof id === 'string' && /^[A-Z0-9_-]{1,32}$/i.test(id.trim());

const makeGameIfNotExists = (id) => {
  if (!games.has(id)) {
    games.set(id, {
      players: [],
      playerSessions: {}, // {playerId: sessionId}
      boards: {},
      ready: {},
      turn: null,
      createdAt: Date.now(),
      ttlTimer: null,
      history: [],
      eventBuffer: [],      // Buffer de eventos para reconexiones
      disconnected: {},     // {playerId: {ts, sessionId, gracePeriodTimer}}
      gameOver: false,
      winner: null,
      restartRequests: {},  // {playerId: true} para rastrear quién quiere reiniciar
    });
  }
  return games.get(id);
};

const addEventToBuffer = (game, event) => {
  game.eventBuffer.push({ ...event, ts: Date.now() });
  if (game.eventBuffer.length > MAX_EVENT_BUFFER) {
    game.eventBuffer.shift();
  }
};

const scheduleCleanupIfEmpty = (id) => {
  const g = games.get(id);
  if (!g) return;
  
  const hasActivePlayers = g.players.length > 0;
  const hasDisconnectedPlayers = Object.keys(g.disconnected).length > 0;
  
  // Si hay desconectados en periodo de gracia, no limpiar
  const now = Date.now();
  for (const [pId, disc] of Object.entries(g.disconnected)) {
    if (now - disc.ts < DISCONNECTION_GRACE_PERIOD) {
      hasDisconnectedPlayers = true;
      break;
    }
  }
  
  if (!hasActivePlayers && !hasDisconnectedPlayers) {
    if (g.ttlTimer) clearTimeout(g.ttlTimer);
    g.ttlTimer = setTimeout(() => {
      if (games.get(id)?.players.length === 0) {
        games.delete(id);
        console.log(`[🧹 Cleanup] Sala ${id} eliminada por inactividad`);
      }
    }, GAME_TTL_MS);
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

const removePlayerFromAllGames = (socketId) => {
  let removedFromGames = [];
  for (const [gameId, game] of games.entries()) {
    if (game.players.includes(socketId)) {
      const opponentId = game.players.find(p => p !== socketId);
      
      // Remover de la partida
      game.players = game.players.filter(p => p !== socketId);
      delete game.boards[socketId];
      delete game.ready[socketId];
      delete game.disconnected[socketId];
      delete game.playerSessions[socketId];
      
      if (game.turn === socketId) {
        game.turn = opponentId || null;
      }
      
      // Notificar al rival si existe
      if (opponentId) {
        io.to(opponentId).emit('opponentLeft', { room: gameId });
      }
      
      emitPlayers(gameId);
      scheduleCleanupIfEmpty(gameId);
      removedFromGames.push(gameId);
      
      console.log(`[🚪 AutoLeave] ${socketId.substring(0, 8)} removido de ${gameId}`);
    }
  }
  return removedFromGames;
};

// ----------------- SOCKET.IO -----------------
io.on('connection', (socket) => {
  console.log(`+ Conectado: ${socket.id}`);

  // -------- JOIN GAME --------
  socket.on('joinGame', (gameIdRaw, cb) => {
    try {
      const gameId = gameIdRaw?.trim()?.toUpperCase();
      if (!validId(gameId)) return cb?.({ error: 'gameId inválido' });

      // CRÍTICO: Remover de TODAS las partidas anteriores antes de unirse a una nueva
      const previousGames = removePlayerFromAllGames(socket.id);
      if (previousGames.length > 0) {
        console.log(`[⚠️ MultiGame] ${socket.id.substring(0, 8)} estaba en ${previousGames.length} partida(s), removido de: ${previousGames.join(', ')}`);
        // Salir de las salas del socket
        previousGames.forEach(gId => socket.leave(gId));
      }

      const game = makeGameIfNotExists(gameId);
      const sessionId = socket.handshake.auth?.sessionId || null;

      console.log(`[🎮 Join] ${socket.id.substring(0, 8)} a sala ${gameId} (session: ${sessionId?.substring(0, 8) || 'NEW'})`);

      // Caso 1: Reconexión - mismo sessionId
      if (sessionId && sessionMap.has(sessionId)) {
        const sess = sessionMap.get(sessionId);
        if (sess.gameId === gameId) {
          const playerId = sess.playerId;
          
          // Agregar nuevo socket a la sesión
          if (!sess.socketIds.includes(socket.id)) sess.socketIds.push(socket.id);
          
          // Restaurar en el juego
          if (!game.players.includes(playerId)) game.players.push(playerId);
          socket.join(gameId);
          delete game.disconnected[playerId];
          
          const opponentId = game.players.find(p => p !== playerId);
          
          // Notificar reconexión
          if (opponentId) io.to(opponentId).emit('opponentReconnected', { room: gameId });
          
          // Enviar estado del juego y buffer de eventos
          socket.emit('gameState', {
            gameId,
            playerId,
            sessionId,
            players: game.players,
            boards: game.boards,
            turn: game.turn,
            gameOver: game.gameOver,
            winner: game.winner,
            history: game.history.slice(-20), // Últimos 20 eventos
            eventBuffer: game.eventBuffer,
          });
          
          emitPlayers(gameId);
          return cb?.({ success: true, reconnect: true, gameId, playerId, sessionId });
        }
      }

      // Caso 2: Nuevo jugador
      if (game.players.length >= 2) return cb?.({ error: 'Partida llena' });
      if (game.gameOver) return cb?.({ error: 'Partida ya terminada' });

      const newSessionId = `sess_${socket.id}_${Date.now()}`;
      const playerId = socket.id;
      
      game.players.push(playerId);
      game.playerSessions[playerId] = newSessionId;
      socket.join(gameId);
      
      sessionMap.set(newSessionId, {
        gameId,
        playerId,
        socketIds: [socket.id],
        createdAt: Date.now(),
      });

      if (!game.turn) game.turn = game.players[0];
      scheduleCleanupIfEmpty(gameId);

      cb?.({ success: true, gameId, playerId, sessionId: newSessionId });
      emitPlayers(gameId);

      if (game.players.length === 2) {
        io.to(gameId).emit('gameStarted', { room: gameId, message: '¡Partida lista!' });
      }
    } catch (err) { 
      console.error('[ERROR] joinGame:', err); 
      cb?.({ error: 'Error interno' }); 
    }
  });

  // -------- SEND BOARD --------
  socket.on('sendBoard', ({ gameId: raw, board } = {}, cb) => {
    try {
      const gameId = raw?.trim()?.toUpperCase() || inferRoom(socket);
      const game = games.get(gameId);
      if (!game) return cb?.({ error: 'Partida no encontrada' });

      game.boards[socket.id] = board;
      game.ready[socket.id] = true;
      addEventToBuffer(game, { type: 'boardReady', playerId: socket.id });
      cb?.({ success: true });

      // Si ambos están listos, comienza el juego
      if (Object.keys(game.ready).length === 2) {
        const startedPlayer = game.turn || game.players[0];
        io.to(gameId).emit('gameStarted', { room: gameId, startedBy: startedPlayer });
        io.to(gameId).emit('beginTurn', { room: gameId, currentPlayer: startedPlayer });
        addEventToBuffer(game, { type: 'gameStarted', startedBy: startedPlayer });
      }
    } catch (err) { console.error('[ERROR] sendBoard:', err); cb?.({ error: 'Error interno' }); }
  });

  // -------- PLAYER SHOT --------
  socket.on('playerShot', ({ gameId: raw, row, col } = {}, cb) => {
    try {
      // Rate limiting
      if (!checkRateLimit(socket.id)) {
        return cb?.({ error: 'Demasiados disparos muy rápido. Espera un momento.' });
      }

      const gameId = raw?.trim()?.toUpperCase() || inferRoom(socket);
      const game = games.get(gameId);
      if (!game) return cb?.({ error: 'Partida no encontrada' });
      
      // Validar que el jugador esté en la partida
      if (!game.players.includes(socket.id)) {
        console.warn(`[⚠️ InvalidShot] ${socket.id.substring(0, 8)} intentó disparar en ${gameId} pero no está en la partida`);
        return cb?.({ error: 'No estás en esta partida' });
      }
      
      if (game.turn !== socket.id) return cb?.({ error: 'No es tu turno' });

      const opponentId = game.players.find(id => id !== socket.id);
      if (!opponentId) return cb?.({ error: 'Esperando rival' });

      // Validar coordenadas
      if (typeof row !== 'number' || typeof col !== 'number' || row < 0 || row >= 10 || col < 0 || col >= 10) {
        return cb?.({ error: 'Coordenadas inválidas' });
      }

      // Guardar en historial y buffer
      game.history.push({ type: 'shot', player: socket.id, row, col, ts: Date.now() });
      addEventToBuffer(game, { type: 'shot', from: socket.id, row, col });

      io.to(opponentId).emit('incomingShot', { room: gameId, row, col, from: socket.id });
      cb?.({ success: true });
    } catch (err) { 
      console.error('[ERROR] playerShot:', err); 
      cb?.({ error: 'Error interno' }); 
    }
  });

  // -------- SHOT RESULT --------
  socket.on('shotResult', ({ gameId: raw, result, row, col, from, allSunk } = {}, cb) => {
    try {
      const gameId = raw?.trim()?.toUpperCase() || inferRoom(socket);
      const game = games.get(gameId);
      if (!game) return cb?.({ error: 'Partida no encontrada' });
      
      // Validar que el jugador esté en la partida
      if (!game.players.includes(socket.id)) {
        console.warn(`[⚠️ InvalidResult] ${socket.id.substring(0, 8)} intentó enviar resultado en ${gameId} pero no está en la partida`);
        return cb?.({ error: 'No estás en esta partida' });
      }

      const attackerId = from || game.players.find(p => p !== socket.id);
      if (!attackerId) return cb?.({ error: 'Atacante desconocido' });
      
      // Validar que el atacante también esté en la partida
      if (!game.players.includes(attackerId)) {
        console.warn(`[⚠️ InvalidResult] Atacante ${attackerId.substring(0, 8)} no está en ${gameId}`);
        return cb?.({ error: 'Atacante no válido' });
      }

      // Guardar en historial y buffer
      game.history.push({ type: 'result', player: socket.id, attacker: attackerId, result, row, col, allSunk, ts: Date.now() });
      addEventToBuffer(game, { type: 'shotResult', from: attackerId, result, row, col, allSunk });

      if (allSunk) {
        game.gameOver = true;
        game.winner = attackerId;
        io.to(attackerId).emit('shotFeedback', { room: gameId, result, row, col, allSunk, nextPlayer: null });
        io.to(gameId).emit('gameOver', { room: gameId, winner: attackerId, loser: socket.id });
        game.turn = null;
        addEventToBuffer(game, { type: 'gameOver', winner: attackerId, loser: socket.id });
        scheduleCleanupIfEmpty(gameId);
      } else {
        // Cambiar turno al defensor
        const nextPlayer = socket.id;
        game.turn = nextPlayer;
        io.to(attackerId).emit('shotFeedback', { room: gameId, result, row, col, allSunk, nextPlayer });
        io.to(gameId).emit('beginTurn', { room: gameId, currentPlayer: nextPlayer });
        addEventToBuffer(game, { type: 'turnChanged', turn: nextPlayer });
      }
      cb?.({ success: true });
    } catch (err) { console.error('[ERROR] shotResult:', err); cb?.({ error: 'Error interno' }); }
  });

  // -------- REQUEST RESTART (Solicitar reiniciar) --------
  socket.on('requestRestart', (gameIdRaw, cb) => {
    try {
      const gameId = gameIdRaw?.trim()?.toUpperCase() || inferRoom(socket);
      const game = games.get(gameId);
      if (!game) return cb?.({ error: 'Partida no encontrada' });
      
      // Validar que esté en la partida
      if (!game.players.includes(socket.id)) {
        return cb?.({ error: 'No estás en esta partida' });
      }

      // Marcar que este jugador quiere reiniciar
      game.restartRequests[socket.id] = true;
      console.log(`[🔄 Restart] ${socket.id.substring(0, 8)} solicita reiniciar ${gameId}`);
      
      const opponentId = game.players.find(p => p !== socket.id);
      
      // Notificar al rival que este jugador quiere reiniciar
      if (opponentId) {
        io.to(opponentId).emit('opponentRequestsRestart', { room: gameId });
      }
      
      // Si ambos quieren reiniciar, reiniciar la partida
      const allWantRestart = game.players.every(p => game.restartRequests[p]);
      
      if (allWantRestart && game.players.length === 2) {
        console.log(`[✅ Restart] Ambos aceptaron, reiniciando ${gameId}`);
        
        // Limpiar estado del juego pero mantener jugadores
        game.boards = {};
        game.ready = {};
        game.turn = game.players[0] || null;
        game.history = [];
        game.eventBuffer = [];
        game.gameOver = false;
        game.winner = null;
        game.restartRequests = {};
        
        // Notificar a ambos que se reinicia
        io.to(gameId).emit('gameRestarted', { room: gameId });
        cb?.({ success: true, restarted: true });
      } else {
        cb?.({ success: true, waiting: true });
      }
    } catch (err) { 
      console.error('[ERROR] requestRestart:', err); 
      cb?.({ error: 'Error interno' }); 
    }
  });
  
  // -------- CANCEL RESTART (Cancelar reinicio) --------
  socket.on('cancelRestart', (gameIdRaw, cb) => {
    try {
      const gameId = gameIdRaw?.trim()?.toUpperCase() || inferRoom(socket);
      const game = games.get(gameId);
      if (!game) return cb?.({ success: true });
      
      // Limpiar solicitudes de reinicio
      game.restartRequests = {};
      
      const opponentId = game.players.find(p => p !== socket.id);
      if (opponentId) {
        io.to(opponentId).emit('opponentCancelledRestart', { room: gameId });
      }
      
      cb?.({ success: true });
      console.log(`[❌ Restart] ${socket.id.substring(0, 8)} canceló reinicio en ${gameId}`);
    } catch (err) {
      console.error('[ERROR] cancelRestart:', err);
      cb?.({ error: 'Error interno' });
    }
  });

  // -------- LEAVE GAME (Salida voluntaria) --------
  socket.on('leaveGame', (gameIdRaw, cb) => {
    try {
      const gameId = gameIdRaw?.trim()?.toUpperCase() || inferRoom(socket);
      const game = games.get(gameId);
      if (!game) return cb?.({ success: true }); // Si no existe, ya salió

      const opponentId = game.players.find(p => p !== socket.id);
      const sessionId = game.playerSessions?.[socket.id];
      
      // Limpiar jugador de la partida
      game.players = game.players.filter(p => p !== socket.id);
      delete game.boards[socket.id];
      delete game.ready[socket.id];
      delete game.disconnected[socket.id];
      delete game.playerSessions[socket.id];
      
      // Limpiar sessionMap
      if (sessionId && sessionMap.has(sessionId)) {
        sessionMap.delete(sessionId);
      }
      
      if (game.turn === socket.id) {
        game.turn = opponentId || null;
      }

      // Notificar al rival
      if (opponentId) {
        io.to(opponentId).emit('opponentLeft', { room: gameId });
        if (game.turn === opponentId && !game.gameOver) {
          io.to(opponentId).emit('beginTurn', { room: gameId, currentPlayer: opponentId });
        }
      }
      
      emitPlayers(gameId);
      scheduleCleanupIfEmpty(gameId);
      
      socket.leave(gameId);
      cb?.({ success: true });
      console.log(`[👋 Leave] ${socket.id.substring(0, 8)} dejó la partida ${gameId}`);
    } catch (err) { console.error('[ERROR] leaveGame:', err); cb?.({ error: 'Error interno' }); }
  });

  // -------- DISCONNECT --------
  socket.on('disconnect', () => {
    console.log(`- Desconectado: ${socket.id}`);
    
    for (const [gameId, game] of games.entries()) {
      const playerId = socket.id;
      if (!game.players.includes(playerId)) continue;

      const opponentId = game.players.find(p => p !== playerId);
      const sessionId = game.playerSessions[playerId];

      // Remover socket de la sesión pero mantener la sesión activa
      if (sessionId && sessionMap.has(sessionId)) {
        const sess = sessionMap.get(sessionId);
        sess.socketIds = sess.socketIds.filter(id => id !== socket.id);
      }

      // Mantener el jugador en la partida pero marcar como desconectado
      game.disconnected[playerId] = {
        ts: Date.now(),
        sessionId,
      };

      // Establecer período de gracia para reconexión
      const gracePeriodTimer = setTimeout(() => {
        const disc = game.disconnected[playerId];
        if (disc && Date.now() - disc.ts >= DISCONNECTION_GRACE_PERIOD) {
          // Considerado como abandono
          game.players = game.players.filter(p => p !== playerId);
          delete game.boards[playerId];
          delete game.ready[playerId];
          delete game.disconnected[playerId];
          
          if (game.turn === playerId && !game.gameOver) {
            game.turn = opponentId || null;
            if (opponentId) {
              io.to(opponentId).emit('opponentLeft', { room: gameId });
              io.to(gameId).emit('beginTurn', { room: gameId, currentPlayer: opponentId });
            }
          }
          
          emitPlayers(gameId);
          scheduleCleanupIfEmpty(gameId);
          console.log(`[👋 Grace End] ${playerId.substring(0, 8)} se fue de ${gameId} (grace period expiró)`);
        }
      }, DISCONNECTION_GRACE_PERIOD);

      game.disconnected[playerId].gracePeriodTimer = gracePeriodTimer;

      // Notificar al rival
      if (opponentId) {
        io.to(opponentId).emit('opponentDisconnected', { room: gameId, grace: DISCONNECTION_GRACE_PERIOD / 1000 });
      }

      scheduleCleanupIfEmpty(gameId);
      console.log(`[⚠️ Grace] ${playerId.substring(0, 8)} desconectado de ${gameId} (período de gracia: ${DISCONNECTION_GRACE_PERIOD / 1000}s)`);
    }
  });

  // -------- DIAGNOSTICS --------
  socket.on('pingServer', (payload, cb) => cb?.({ pong: true, ts: Date.now() }));
});

server.listen(PORT, () => console.log(`🚀 Socket.IO server listening on :${PORT}`));
