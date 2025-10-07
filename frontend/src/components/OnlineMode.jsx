import React, { useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SOCKET_URL) ||
  (typeof process !== 'undefined' && process.env?.REACT_APP_SOCKET_URL) ||
  'http://localhost:3001';

function getOrCreateSocket() {
  if (typeof window === 'undefined') return null;
  if (!window.__BATTLESHIP_SOCKET__) {
    window.__BATTLESHIP_SOCKET__ = io(SERVER_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
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
}) => {
  const [gameId, setGameId] = useState('');
  const [status, setStatus] = useState('Modo local');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [playerId, setPlayerId] = useState(null);
  const [socketReady, setSocketReady] = useState(false);

  const socketRef = useRef(null);
  const mountedRef = useRef(true);

  /* ========================
     🧠 Conexión Socket
  ======================== */
  useEffect(() => {
    mountedRef.current = true;
    const s = getOrCreateSocket();
    socketRef.current = s;
    if (!s) return () => { mountedRef.current = false; };

    const onConnect = () => {
      if (!mountedRef.current) return;
      setSocketReady(true);
      setPlayerId(s.id);
      setSocketInstance?.(s);
      setStatus('✅ Conectado al servidor');
    };

    const onConnectError = (err) => {
      if (!mountedRef.current) return;
      setStatus('❌ No se pudo conectar');
      setSocketReady(false);
    };

    const onReconnectAttempt = (attempt) => {
      if (!mountedRef.current) return;
      setStatus(`Reintentando conexión (${attempt})...`);
    };

    const onDisconnect = (reason) => {
      if (!mountedRef.current) return;
      setSocketReady(false);
      setStatus(`Desconectado: ${reason}`);
    };

    s.on('connect', onConnect);
    s.on('connect_error', onConnectError);
    s.on('reconnect_attempt', onReconnectAttempt);
    s.on('disconnect', onDisconnect);

    if (!s.connected) s.connect();

    return () => {
      mountedRef.current = false;
      s.off('connect', onConnect);
      s.off('connect_error', onConnectError);
      s.off('reconnect_attempt', onReconnectAttempt);
      s.off('disconnect', onDisconnect);
    };
  }, [setSocketInstance]);

  /* ===============================
     🎧 Listeners de eventos de juego
  ================================ */
  const setupGameListeners = useCallback(() => {
    const s = socketRef.current;
    if (!s) return;

    const safeOn = (event, handler) => {
      s.off(event);
      s.on(event, handler);
    };

    safeOn('playerJoined', ({ players }) => {
      if (!mountedRef.current) return;
      const txt = players.length === 2
        ? '👾 Rival conectado. Preparando partida...'
        : `Jugadores en sala: ${players.length}/2`;
      setStatus(txt);

      if (players.length === 2) {
        s.emit('sendBoard', { gameId, board: playerGrid });
      }
    });

    safeOn('beginTurn', ({ currentPlayer }) => {
      if (!mountedRef.current) return;
      const amI = s.id === currentPlayer;
      switchOnlineTurn?.(amI);
      setStatus(amI ? '🔥 Tu turno' : '⏳ Turno del rival');
    });

    safeOn('incomingShot', ({ row, col, from }) => {
      if (!mountedRef.current) return;
      handleIncomingShot?.(row, col, (result, allSunk) => {
        s.emit('shotResult', { gameId, result, row, col, from, allSunk });
      });
    });

    safeOn('shotFeedback', ({ result, row, col, nextPlayer, allSunk }) => {
      if (!mountedRef.current) return;

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
                  '💥 ¡Hundiste un barco!';
      setMessage?.(msg);

      if (allSunk) {
        setMessage?.('🏆 ¡Ganaste la partida!');
        setGameOver?.(true);
        setStatus?.('');
      } else {
        const amINext = nextPlayer === s.id;
        switchOnlineTurn?.(amINext);
        setStatus?.(amINext ? '🔥 Tu turno' : '⏳ Turno del rival');
      }
    });

    safeOn('playerDisconnected', () => {
      if (!mountedRef.current) return;
      setStatus('⚠️ Rival desconectado. Volviendo a modo local...');
      setIsOnline?.(false);
      startGame?.();
    });
  }, [gameId, playerGrid, handleIncomingShot, switchOnlineTurn, setOpponentGrid, setMessage, setGameOver, setIsOnline, startGame]);

  useEffect(() => {
    setupGameListeners();
  }, [setupGameListeners]);

  /* ======================
     🛠️ Funciones de juego
  ====================== */
  const createGame = useCallback(() => {
    const s = socketRef.current;
    if (!s || !s.connected) { setStatus('No conectado'); return; }
    const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
    setIsConnecting(true);
    setIsHost(true);
    s.emit('joinGame', newId, (res) => {
      setIsConnecting(false);
      if (res?.error) return setStatus(res.error);
      setGameId(newId);
      setStatus(`Sala creada: ${newId} 🧭 Esperando rival...`);
      setIsOnline?.(true);
      startGame?.();
    });
  }, [setIsOnline, startGame]);

  const joinGame = useCallback(() => {
    const s = socketRef.current;
    if (!s || !s.connected) { setStatus('No conectado'); return; }
    if (!gameId) return setStatus('Ingresa un ID válido');
    setIsConnecting(true);
    s.emit('joinGame', gameId.toUpperCase(), (res) => {
      setIsConnecting(false);
      if (res?.error) return setStatus(res.error);
      setStatus(`Unido a sala ${gameId} ✨`);
      setIsOnline?.(true);
      startGame?.();
      s.emit('sendBoard', { gameId: gameId.toUpperCase(), board: playerGrid });
    });
  }, [gameId, playerGrid, setIsOnline, startGame]);

  const copyGameId = useCallback(async () => {
    if (!gameId) return;
    try { await navigator.clipboard.writeText(gameId); setStatus('📋 ID copiado'); }
    catch { setStatus('No se pudo copiar'); }
  }, [gameId]);

  const handleModeSwitch = useCallback((toOnline) => {
    if (!toOnline) {
      if (!window.confirm('¿Volver a modo local y reiniciar partida?')) return;
      setIsOnline?.(false);
      setStatus('Modo local');
      startGame?.();
      return;
    }
    if (!window.confirm('¿Cambiar a modo online y reiniciar partida?')) return;
    setIsOnline?.(true);
    setStatus('Modo online 🌐 Conéctate o crea sala');
  }, [setIsOnline, startGame]);

  /* ======================
     🎨 UI Mejorada para móvil
  ====================== */
  return (
    <div className="flex flex-col gap-3 items-center bg-white/70 p-4 rounded-lg shadow-md w-full sm:w-auto">
      {/* Switch Modo Local / Online */}
      <div className="flex flex-col sm:flex-row gap-2 w-full justify-center">
        <button
          onClick={() => handleModeSwitch(false)}
          className={`w-full sm:w-auto px-4 py-2 font-bold rounded ${!isOnline ? 'bg-blue-700 text-white' : 'bg-gray-200 text-gray-700'} transition-colors`}
        >
          Modo Local
        </button>
        <button
          onClick={() => handleModeSwitch(true)}
          className={`w-full sm:w-auto px-4 py-2 font-bold rounded ${isOnline ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-700'} transition-colors`}
        >
          Modo Online
        </button>
      </div>

      {/* Controles Online */}
      {isOnline && (
        <div className="flex flex-col gap-3 w-full items-center">
          <div className="flex flex-col sm:flex-row gap-2 w-full justify-center items-center">
            <input
              type="text"
              value={gameId}
              onChange={(e) => setGameId(e.target.value.toUpperCase())}
              placeholder="ID de partida"
              className="w-full sm:w-auto px-3 py-2 rounded border focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isConnecting}
            />
            <button
              onClick={joinGame}
              disabled={isConnecting}
              className="bg-green-600 text-white px-4 py-2 rounded w-full sm:w-auto font-semibold"
            >
              Unirse
            </button>
            <button
              onClick={createGame}
              disabled={isConnecting}
              className="bg-blue-600 text-white px-4 py-2 rounded w-full sm:w-auto font-semibold"
            >
              Crear
            </button>
            <button
              onClick={copyGameId}
              disabled={!gameId}
              className="bg-gray-300 px-3 py-2 rounded w-full sm:w-auto font-medium"
            >
              Copiar
            </button>
          </div>
          <div className="text-center text-sm sm:text-base mt-1 font-medium">{isConnecting ? 'Conectando...' : status}</div>
          <div className="text-center text-xs text-gray-600">Servidor: {SERVER_URL}</div>
        </div>
      )}
    </div>
  );
};

export default OnlineMode;
