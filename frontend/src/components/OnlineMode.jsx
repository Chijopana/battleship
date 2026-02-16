import React, { useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SOCKET_URL) ||
  (typeof process !== 'undefined' && process.env?.REACT_APP_SOCKET_URL) ||
  'https://battleship-bx9q.onrender.com';

function getOrCreateSocket() {
  if (typeof window === 'undefined') return null;
  if (!window.__BATTLESHIP_SOCKET__) {
    // Recuperar sessionId guardado
    const savedSessionId = localStorage.getItem('battleship_sessionId');
    
    window.__BATTLESHIP_SOCKET__ = io(SERVER_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 15,           // Más intentos
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,        // Máximo 10s entre intentos
      auth: {
        sessionId: savedSessionId || undefined
      }
    });
  }
  return window.__BATTLESHIP_SOCKET__;
}

const OnlineMode = ({
  setIsOnline,
  isOnline,
  playerGrid,
  startGame,
  handleIncomingShot,
  switchOnlineTurn,
  setSocketInstance,
  setMessage,
  setGameOver,
  setOpponentGrid,
  updateOpponentGrid,
  setWaitingForOpponentRestart,
  setOpponentWantsRestart,
}) => {
  const [gameId, setGameId] = useState('');
  const [status, setStatus] = useState('Modo local');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [playerId, setPlayerId] = useState(null);
  const [socketReady, setSocketReady] = useState(false);
  const [isTemporarilyDisconnected, setIsTemporarilyDisconnected] = useState(false);
  const [gracePeriodRemaining, setGracePeriodRemaining] = useState(0);

  const socketRef = useRef(null);
  const mountedRef = useRef(true);
  const gameIdRef = useRef('');
  const listenersSetupRef = useRef(false);
  const lastShotTimeRef = useRef(0);
  const gracePeriodTimerRef = useRef(null);
  const startGameRef = useRef(startGame);
  const cleanupPreviousGameRef = useRef(null);
  
  // Mantener refs actualizadas
  useEffect(() => {
    startGameRef.current = startGame;
  }, [startGame]);

  /* ========================
     🧠 Conexión Socket
  ======================== */
  useEffect(() => {
    mountedRef.current = true;
    const s = getOrCreateSocket();
    socketRef.current = s;
    gameIdRef.current = gameId;
    
    if (!s) return () => { mountedRef.current = false; };

    const onConnect = () => {
      if (!mountedRef.current) return;
      setSocketReady(true);
      setIsTemporarilyDisconnected(false);
      setPlayerId(s.id);
      setSocketInstance?.(s);
      setStatus('✅ Conectado al servidor');
      console.log('[Socket] Conectado:', s.id);
    };

    const onConnectError = (err) => {
      if (!mountedRef.current) return;
      setStatus('❌ Error de conexión, reintentando...');
      setSocketReady(false);
      console.error('[Socket] Error de conexión:', err);
    };

    const onReconnect = () => {
      if (!mountedRef.current) return;
      setSocketReady(true);
      setIsTemporarilyDisconnected(false);
      setStatus('✅ Reconectado');
      if (gracePeriodTimerRef.current) clearInterval(gracePeriodTimerRef.current);
      if (gameIdRef.current) {
        s.emit('joinGame', gameIdRef.current, (res) => {
          if (res?.error) {
            setStatus('❌ ' + res.error);
          } else if (res?.reconnect) {
            setStatus('✅ Reconectado a la partida');
          }
        });
      }
    };

    const onDisconnect = (reason) => {
      if (!mountedRef.current) return;
      setSocketReady(false);
      
      // Diferenciar entre desconexión temporal (cambio de red) y permanente
      if (reason === 'transport close' || reason === 'transport error') {
        setIsTemporarilyDisconnected(true);
        setStatus('⚠️ Conexión perdida, reconectando...');
        console.warn('[Socket] Desconexión temporal:', reason);
      } else {
        setStatus(`⚠️ Desconectado: ${reason}`);
        console.warn('[Socket] Desconectado:', reason);
      }
    };

    s.on('connect', onConnect);
    s.on('connect_error', onConnectError);
    s.on('reconnect', onReconnect);
    s.on('disconnect', onDisconnect);

    if (!s.connected) s.connect();

    return () => {
      mountedRef.current = false;
      s.off('connect', onConnect);
      s.off('connect_error', onConnectError);
      s.off('reconnect', onReconnect);
      s.off('disconnect', onDisconnect);
    };
  }, [setSocketInstance]);

  /* ===============================
     🎧 Listeners de eventos de juego
  ================================ */
  useEffect(() => {
    const s = socketRef.current;
    if (!s || !isOnline) return;

    // Solo configurar listeners una vez
    if (listenersSetupRef.current) return;
    listenersSetupRef.current = true;

    console.log('[GameListeners] Configurando listeners del juego');

    const onPlayerJoined = ({ players }) => {
      if (!mountedRef.current) return;
      const txt = players.length === 2
        ? '👾 Rival conectado. Preparando partida...'
        : `Jugadores en sala: ${players.length}/2`;
      setStatus(txt);
      console.log('[GameEvent] playerJoined - Jugadores:', players.length);
    };

    const onGameStarted = ({ startedBy }) => {
      if (!mountedRef.current) return;
      console.log('[GameEvent] gameStarted - Iniciado por:', startedBy);
      setMessage('🎮 ¡Partida iniciada!');
    };

    const onBeginTurn = ({ currentPlayer }) => {
      if (!mountedRef.current) return;
      const amI = s.id === currentPlayer;
      switchOnlineTurn?.(amI);
      setStatus(amI ? '🔥 Tu turno' : '⏳ Turno del rival');
      console.log('[GameEvent] beginTurn - Tu turno:', amI, '| currentPlayer:', currentPlayer.substring(0, 8), 'Tu ID:', s.id.substring(0, 8));
    };

    const onIncomingShot = ({ row, col, from }) => {
      if (!mountedRef.current) return;
      console.log('[GameEvent] incomingShot - Disparo en:', row, col);
      handleIncomingShot?.(row, col, (result, allSunk) => {
        const gId = gameIdRef.current;
        console.log('[Response] Enviando shotResult -', { result, row, col, allSunk, gameId: gId });
        s.emit('shotResult', { gameId: gId, result, row, col, from, allSunk });
      });
    };

    const onShotFeedback = ({ result, row, col, nextPlayer, allSunk }) => {
      if (!mountedRef.current) return;
      console.log('[GameEvent] shotFeedback - Resultado:', result, '| nextPlayer:', nextPlayer?.substring(0, 8));
      
      setOpponentGrid(prev => {
        if (!prev) return prev;
        const newGrid = prev.map(r => r.map(c => ({ ...c })));
        if (newGrid[row] && newGrid[row][col]) {
          newGrid[row][col].hit = true;
          newGrid[row][col].type = result;
        }
        return newGrid;
      });

      const msg = result === 'agua' ? '💦 Fallaste' :
                  result === 'tocado' ? '🎯 ¡Tocado!' :
                  result === 'hundido' ? '💥 ¡Hundiste un barco!' :
                  '❓ Resultado desconocido';
      setMessage?.(msg);

      if (allSunk) {
        setMessage?.('🏆 ¡Ganaste la partida!');
        setGameOver?.(true);
        setStatus?.('✅ Victoria');
      }
    };

    const onGameOver = ({ winner, loser }) => {
      if (!mountedRef.current) return;
      const iWon = s.id === winner;
      console.log('[GameEvent] gameOver - Ganador:', winner.substring(0, 8), '| Yo:', s.id.substring(0, 8));
      if (!iWon) {
        setMessage?.('😵 ¡Perdiste la partida!');
        setGameOver?.(true);
      }
    };

    const onOpponentLeft = () => {
      if (!mountedRef.current) return;
      console.log('[GameEvent] opponentLeft - El rival abandonó la partida');
      
      // Limpiar timers de gracia
      if (gracePeriodTimerRef.current) {
        clearInterval(gracePeriodTimerRef.current);
        gracePeriodTimerRef.current = null;
      }
      setGracePeriodRemaining(0);
      
      // Mostrar mensaje y volver a modo local
      setMessage?.('👋 El rival abandonó la partida');
      setStatus('🔌 Rival desconectado - Volviendo a modo local...');
      
      // Volver a modo local después de 2 segundos
      setTimeout(() => {
        cleanupPreviousGameRef.current?.();
        setIsOnline?.(false);
        setStatus('Modo local');
        startGameRef.current?.();
      }, 2000);
    };

    const onOpponentDisconnected = ({ grace }) => {
      if (!mountedRef.current) return;
      console.log('[GameEvent] opponentDisconnected - Grace period:', grace, 'segundos');
      setStatus(`⚠️ Rival desconectado (esperando ${grace}s)`);
      
      if (gracePeriodTimerRef.current) clearInterval(gracePeriodTimerRef.current);
      let remaining = grace;
      setGracePeriodRemaining(remaining);
      
      gracePeriodTimerRef.current = setInterval(() => {
        remaining--;
        setGracePeriodRemaining(remaining);
        if (remaining <= 0) {
          clearInterval(gracePeriodTimerRef.current);
          setStatus('😵 El rival se ha ido');
        }
      }, 1000);
    };

    const onOpponentReconnected = () => {
      if (!mountedRef.current) return;
      console.log('[GameEvent] opponentReconnected');
      if (gracePeriodTimerRef.current) clearInterval(gracePeriodTimerRef.current);
      setStatus('✅ Rival reconectado');
      setGracePeriodRemaining(0);
    };

    const onGameState = ({ sessionId, playerId, ...state }) => {
      if (!mountedRef.current) return;
      console.log('[GameEvent] gameState - Sincronizando estado después de reconexión');
      
      // Guardar sessionId en localStorage para futuras reconexiones
      if (sessionId) {
        localStorage.setItem('battleship_sessionId', sessionId);
      }
      
      // Aquí el frontend puede sincronizar el estado del juego
      // Este evento se emite cuando se reconecta después de un cambio de red
    };

    const onOpponentRequestsRestart = () => {
      if (!mountedRef.current) return;
      console.log('[GameEvent] opponentRequestsRestart - El rival quiere reiniciar');
      setOpponentWantsRestart?.(true);
      setStatus('🎮 El rival quiere jugar otra vez');
    };

    const onOpponentCancelledRestart = () => {
      if (!mountedRef.current) return;
      console.log('[GameEvent] opponentCancelledRestart - El rival canceló el reinicio');
      setOpponentWantsRestart?.(false);
      setWaitingForOpponentRestart?.(false);
      setMessage?.('❌ El rival canceló el reinicio');
    };

    const onGameRestarted = () => {
      if (!mountedRef.current) return;
      console.log('[GameEvent] gameRestarted - ¡Partida reiniciada!');
      setWaitingForOpponentRestart?.(false);
      setOpponentWantsRestart?.(false);
      setMessage?.('🎉 ¡Partida reiniciada! Nueva ronda');
      
      // Reiniciar el juego localmente
      startGameRef.current?.();
    };

    s.on('playerJoined', onPlayerJoined);
    s.on('gameStarted', onGameStarted);
    s.on('beginTurn', onBeginTurn);
    s.on('incomingShot', onIncomingShot);
    s.on('shotFeedback', onShotFeedback);
    s.on('gameState', onGameState);
    s.on('opponentLeft', onOpponentLeft);
    s.on('opponentDisconnected', onOpponentDisconnected);
    s.on('opponentReconnected', onOpponentReconnected);
    s.on('opponentRequestsRestart', onOpponentRequestsRestart);
    s.on('opponentCancelledRestart', onOpponentCancelledRestart);
    s.on('gameRestarted', onGameRestarted);
    s.on('gameOver', onGameOver);

    return () => {
      s.off('playerJoined', onPlayerJoined);
      s.off('gameStarted', onGameStarted);
      s.off('beginTurn', onBeginTurn);
      s.off('incomingShot', onIncomingShot);
      s.off('shotFeedback', onShotFeedback);
      s.off('gameState', onGameState);
      s.off('opponentLeft', onOpponentLeft);
      s.off('opponentDisconnected', onOpponentDisconnected);
      s.off('opponentReconnected', onOpponentReconnected);
      s.off('opponentRequestsRestart', onOpponentRequestsRestart);
      s.off('opponentCancelledRestart', onOpponentCancelledRestart);
      s.off('gameRestarted', onGameRestarted);
      s.off('gameOver', onGameOver);
      listenersSetupRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, handleIncomingShot, switchOnlineTurn, setOpponentGrid, setMessage, setGameOver, setIsOnline, setWaitingForOpponentRestart, setOpponentWantsRestart]);

  /* ======================
     🛠️ Funciones de juego
  ====================== */
  
  // Función para limpiar la partida anterior antes de unirse a una nueva
  const cleanupPreviousGame = useCallback(() => {
    const s = socketRef.current;
    const previousGameId = gameIdRef.current;
    
    if (previousGameId && s && s.connected) {
      console.log('[Cleanup] Saliendo de partida anterior:', previousGameId);
      s.emit('leaveGame', previousGameId, (res) => {
        console.log('[Cleanup] Resultado leaveGame:', res);
      });
    }
    
    // Resetear estado local
    gameIdRef.current = '';
    setGameId('');
    listenersSetupRef.current = false;
    setIsHost(false);
    setGracePeriodRemaining(0);
    if (gracePeriodTimerRef.current) {
      clearInterval(gracePeriodTimerRef.current);
      gracePeriodTimerRef.current = null;
    }
    
    // Limpiar localStorage para evitar reconexiones fantasma
    localStorage.removeItem('battleship_sessionId');
    localStorage.removeItem('battleship_gameId');
  }, []);
  
  // Mantener cleanupPreviousGameRef actualizada
  useEffect(() => {
    cleanupPreviousGameRef.current = cleanupPreviousGame;
  }, [cleanupPreviousGame]);

  const createGame = useCallback(() => {
    const s = socketRef.current;
    if (!s || !s.connected) { setStatus('❌ No conectado'); return; }
    
    // Limpiar partida anterior ANTES de crear nueva
    cleanupPreviousGameRef.current?.();
    
    const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
    setIsConnecting(true);
    setIsHost(true);
    console.log('[Action] Creando sala:', newId);
    
    s.emit('joinGame', newId, (res) => {
      setIsConnecting(false);
      if (res?.error) {
        console.error('[Error] Error al crear sala:', res.error);
        return setStatus('❌ ' + res.error);
      }
      
      // Guardar sessionId y gameId para reconexiones
      if (res?.sessionId) {
        localStorage.setItem('battleship_sessionId', res.sessionId);
      }
      if (res?.gameId) {
        localStorage.setItem('battleship_gameId', res.gameId);
      }
      
      setGameId(newId);
      gameIdRef.current = newId;
      setStatus(`Sala creada: ${newId} 🧭 Esperando rival...`);
      setIsOnline?.(true);
      startGameRef.current?.();
      
      // Enviar tablero después de entrar a la sala
      setTimeout(() => {
        s.emit('sendBoard', { gameId: newId, board: playerGrid });
      }, 100);
    });
  }, [setIsOnline, playerGrid]);

  const joinGame = useCallback(() => {
    const s = socketRef.current;
    if (!s || !s.connected) { setStatus('❌ No conectado al servidor'); return; }
    if (!gameId) return setStatus('⚠️ Ingresa un ID válido');
    
    // Validar formato de ID
    if (!/^[A-Z0-9_-]{1,32}$/i.test(gameId.trim())) {
      return setStatus('❌ ID inválido (solo letras, números, _, -)');
    }
    
    // Limpiar partida anterior ANTES de unirse a nueva
    cleanupPreviousGameRef.current?.();
    
    setIsConnecting(true);
    const upperGameId = gameId.toUpperCase();
    console.log('[Action] Uniéndose a sala:', upperGameId);
    
    s.emit('joinGame', upperGameId, (res) => {
      setIsConnecting(false);
      if (res?.error) {
        console.error('[Error] Error al unirse:', res.error);
        return setStatus('❌ ' + res.error);
      }
      
      // Guardar sessionId y gameId para reconexiones
      if (res?.sessionId) {
        localStorage.setItem('battleship_sessionId', res.sessionId);
      }
      if (res?.gameId) {
        localStorage.setItem('battleship_gameId', res.gameId);
      }
      
      gameIdRef.current = upperGameId;
      setStatus(`Unido a sala ${upperGameId} ✨`);
      setIsOnline?.(true);
      startGameRef.current?.();
      
      // Enviar tablero después de entrar a la sala
      setTimeout(() => {
        s.emit('sendBoard', { gameId: upperGameId, board: playerGrid });
      }, 100);
    });
  }, [gameId, playerGrid, setIsOnline]);

  const copyGameId = useCallback(async () => {
    if (!gameId) return;
    try {
      await navigator.clipboard.writeText(gameId);
      setStatus('📋 ID copiado al portapapeles');
    }
    catch {
      setStatus('❌ No se pudo copiar');
    }
  }, [gameId]);

  const handleModeSwitch = useCallback((toOnline) => {
    const s = socketRef.current;
    if (!toOnline) {
      if (!window.confirm('¿Volver a modo local y abandonar la partida?')) return;
      // Limpiar partida online
      cleanupPreviousGameRef.current?.();
      setIsOnline?.(false);
      setStatus('Modo local');
      startGameRef.current?.();
      return;
    }
    if (!window.confirm('¿Cambiar a modo online y reiniciar partida?')) return;
    // Limpiar cualquier partida anterior al cambiar a modo online
    cleanupPreviousGameRef.current?.();
    setIsOnline?.(true);
    setStatus('Modo online 🌐 Conéctate o crea sala');
  }, [setIsOnline, isOnline]);

  /* ======================
     🎨 UI Mejorada para móvil
  ====================== */
  return (
    <div className="flex flex-col gap-3 items-center bg-gradient-to-br from-blue-600/20 to-purple-600/20 backdrop-blur p-4 sm:p-5 rounded-xl shadow-lg border border-white/20 w-full sm:w-auto">
      {/* Switch Modo Local / Online */}
      <div className="flex flex-col sm:flex-row gap-2 w-full justify-center">
        <button
          onClick={() => handleModeSwitch(false)}
          className={`w-full sm:w-auto px-4 py-3 font-bold rounded-lg transition-all active:scale-95 ${!isOnline ? 'bg-blue-700 text-white shadow-lg' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
        >
          🌐 Modo Local
        </button>
        <button
          onClick={() => handleModeSwitch(true)}
          className={`w-full sm:w-auto px-4 py-3 font-bold rounded-lg transition-all active:scale-95 ${isOnline ? 'bg-red-600 text-white shadow-lg' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
        >
          🔴 Modo Online
        </button>
      </div>

      {/* Controles Online */}
      {isOnline && (
        <div className="flex flex-col gap-3 w-full items-center">
          <div className="flex flex-col sm:flex-row gap-2 w-full justify-center items-stretch sm:items-center">
            <input
              type="text"
              value={gameId}
              onChange={(e) => setGameId(e.target.value.toUpperCase())}
              placeholder="ID de partida (ej: ABC123)"
              maxLength={32}
              className="w-full sm:w-auto px-3 py-2 rounded-lg border-2 border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent disabled:bg-gray-100"
              disabled={isConnecting}
            />
            <button
              onClick={joinGame}
              disabled={isConnecting || !gameId}
              className="bg-green-600 text-white px-4 py-2 rounded-lg w-full sm:w-auto font-semibold hover:bg-green-700 disabled:bg-gray-400 active:scale-95 transition-all"
            >
              ✅ Unirse
            </button>
            <button
              onClick={createGame}
              disabled={isConnecting}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg w-full sm:w-auto font-semibold hover:bg-blue-700 disabled:bg-gray-400 active:scale-95 transition-all"
            >
              ⚡ Crear
            </button>
            <button
              onClick={copyGameId}
              disabled={!gameId}
              className="bg-blue-400 text-white px-3 py-2 rounded-lg w-full sm:w-auto font-medium hover:bg-blue-500 disabled:bg-gray-200 active:scale-95 transition-all"
            >
              📋 Copiar
            </button>
          </div>
          <div className="text-center text-sm sm:text-base mt-1 font-medium text-gray-700">
            {isConnecting ? '⏳ Conectando...' : (
              <>
                {status}
                {isTemporarilyDisconnected && (
                  <div className="text-amber-600 font-bold">⚠️ Reconectando...</div>
                )}
                {gracePeriodRemaining > 0 && (
                  <div className="text-red-600 font-bold">⏱️ {gracePeriodRemaining}s para reconectar</div>
                )}
              </>
            )}
          </div>
          <div className="text-center text-xs text-gray-600 mt-1">
            🔗 Servidor: {SERVER_URL.split('//')[1]?.split('/')[0] || SERVER_URL}
          </div>
        </div>
      )}
    </div>
  );
};

export default OnlineMode;
