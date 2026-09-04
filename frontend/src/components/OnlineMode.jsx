import React, { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import clsx from 'clsx';
import { fleetPayload } from '../game/logic';

const SERVER_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.DEV ? 'http://localhost:3001' : 'https://battleship-bx9q.onrender.com');

const SESSION_KEY = 'battleship_sessionId';
const GAME_KEY = 'battleship_gameId';

const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* modo privado */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* modo privado */ } },
};

/** Un único socket para toda la app, aunque React monte el componente dos veces. */
function getSocket() {
  if (typeof window === 'undefined') return null;
  if (!window.__BATTLESHIP_SOCKET__) {
    window.__BATTLESHIP_SOCKET__ = io(SERVER_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      auth: { sessionId: store.get(SESSION_KEY) || undefined },
    });
  }
  return window.__BATTLESHIP_SOCKET__;
}

const randomRoomId = () => Math.random().toString(36).slice(2, 8).toUpperCase();

const OnlineMode = ({ isOnline, setIsOnline, setSocketInstance, online }) => {
  const [roomInput, setRoomInput] = useState('');
  const [joinedRoom, setJoinedRoom] = useState('');
  const [status, setStatus] = useState('Sin conectar');
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [opponents, setOpponents] = useState(0);
  const [grace, setGrace] = useState(0);
  const [copied, setCopied] = useState(false);

  const socketRef = useRef(null);
  const joinedRoomRef = useRef('');
  const graceTimerRef = useRef(null);

  // Los handlers cambian de identidad entre renders; guardarlos en una ref
  // evita volver a suscribir todos los listeners del socket cada vez.
  const handlersRef = useRef(online);
  handlersRef.current = online;

  const setRoom = useCallback((id) => {
    joinedRoomRef.current = id;
    setJoinedRoom(id);
  }, []);

  const stopGraceCountdown = useCallback(() => {
    if (graceTimerRef.current) clearInterval(graceTimerRef.current);
    graceTimerRef.current = null;
    setGrace(0);
  }, []);

  /* ---------------- Conexión ---------------- */
  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    socketRef.current = s;
    setSocketInstance?.(s);

    const onConnect = () => {
      setConnected(true);
      setStatus('Conectado al servidor');
      // Tras reconectar, volver a entrar en la sala en la que estábamos
      const room = joinedRoomRef.current;
      if (room) {
        s.emit('joinGame', room, (res) => {
          if (res?.error) setStatus(res.error);
          else if (res?.reconnect) setStatus(`Reconectado a ${room}`);
        });
      }
    };
    const onDisconnect = (reason) => {
      setConnected(false);
      setStatus(reason === 'io client disconnect' ? 'Desconectado' : 'Conexión perdida, reintentando…');
    };
    const onConnectError = () => {
      setConnected(false);
      setStatus('No se pudo conectar. El servidor gratuito tarda ~30 s en despertar.');
    };

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('connect_error', onConnectError);
    if (!s.connected) s.connect();

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('connect_error', onConnectError);
    };
  }, [setSocketInstance]);

  /* ---------------- Eventos de partida ---------------- */
  // Los listeners se registran desde el montaje, no al entrar en la sala: el servidor
  // puede emitir beginTurn en cuanto ambos mandan flota, y esa carrera dejaba
  // al segundo jugador esperando un turno que ya había pasado.
  useEffect(() => {
    const s = socketRef.current;
    if (!s) return;

    /** Reparte flota nueva y la envía al servidor. */
    const sendFleet = (room) => {
      const ships = handlersRef.current.startGame(true);
      s.emit('sendBoard', { gameId: room, ships: fleetPayload(ships) }, (res) => {
        if (res?.error) handlersRef.current.say(res.error, 'bad');
      });
    };

    const listeners = {
      playerJoined: ({ players }) => {
        setOpponents(players.length);
        setStatus(players.length === 2 ? 'Rival en la sala' : 'Esperando rival…');
      },

      gameStarted: () => handlersRef.current.say('¡Partida iniciada!'),

      beginTurn: ({ currentPlayer }) => {
        const mine = s.id === currentPlayer;
        handlersRef.current.onBeginTurn(mine);
        setStatus(mine ? 'Tu turno' : 'Turno del rival');
      },

      shotFeedback: (payload) => handlersRef.current.onShotFeedback(payload),
      incomingShot: (payload) => handlersRef.current.onIncomingShot(payload),
      gameOver: ({ winner }) => handlersRef.current.onGameOver(s.id === winner),

      gameState: (state) => {
        if (state.sessionId) {
          store.set(SESSION_KEY, state.sessionId);
          s.auth = { ...s.auth, sessionId: state.sessionId };
        }
        setStatus('Estado sincronizado tras reconectar');
      },

      opponentDisconnected: ({ grace: seconds }) => {
        setStatus('El rival ha perdido la conexión');
        stopGraceCountdown();
        let left = seconds;
        setGrace(left);
        graceTimerRef.current = setInterval(() => {
          left -= 1;
          setGrace(left);
          if (left <= 0) stopGraceCountdown();
        }, 1000);
      },

      opponentReconnected: () => {
        stopGraceCountdown();
        setStatus('El rival ha vuelto');
      },

      opponentLeft: () => {
        stopGraceCountdown();
        setOpponents(1);
        setStatus('El rival abandonó la sala');
        handlersRef.current.say('El rival abandonó la partida.', 'bad');
      },

      opponentRequestsRestart: () => {
        handlersRef.current.onRestartState({ opponentWants: true });
        setStatus('El rival pide revancha');
      },

      opponentCancelledRestart: () => {
        handlersRef.current.onRestartState({ opponentWants: false, waiting: false });
        handlersRef.current.say('El rival canceló la revancha.', 'info');
      },

      gameRestarted: () => {
        stopGraceCountdown();
        handlersRef.current.onRestartState({ waiting: false, opponentWants: false });
        sendFleet(joinedRoomRef.current);
        handlersRef.current.say('Nueva ronda. ¡Suerte!', 'good');
      },
    };

    Object.entries(listeners).forEach(([event, fn]) => s.on(event, fn));
    return () => Object.entries(listeners).forEach(([event, fn]) => s.off(event, fn));
  }, [stopGraceCountdown]);

  useEffect(() => stopGraceCountdown, [stopGraceCountdown]);

  /* ---------------- Acciones ---------------- */
  const enterRoom = useCallback((room) => {
    const s = socketRef.current;
    if (!s?.connected) { setStatus('Todavía sin conexión con el servidor'); return; }

    setBusy(true);
    s.emit('joinGame', room, (res) => {
      setBusy(false);
      if (res?.error) { setStatus(res.error); return; }

      if (res.sessionId) {
        store.set(SESSION_KEY, res.sessionId);
        // Sin esto, una reconexión seguía mandando el sessionId de la carga de página
        s.auth = { ...s.auth, sessionId: res.sessionId };
      }
      store.set(GAME_KEY, room);

      setRoom(room);
      setRoomInput(room);
      setIsOnline(true);
      setStatus(`En la sala ${room}. Esperando rival…`);

      const ships = handlersRef.current.startGame(true);
      s.emit('sendBoard', { gameId: room, ships: fleetPayload(ships) }, (r) => {
        if (r?.error) handlersRef.current.say(r.error, 'bad');
      });
    });
  }, [setIsOnline, setRoom]);

  const createRoom = useCallback(() => enterRoom(randomRoomId()), [enterRoom]);

  const joinRoom = useCallback(() => {
    const room = roomInput.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{1,32}$/.test(room)) { setStatus('ID inválido: solo letras, números, _ y -'); return; }
    enterRoom(room);
  }, [enterRoom, roomInput]);

  const leaveRoom = useCallback(() => {
    const s = socketRef.current;
    if (!window.confirm('¿Salir de la partida online?')) return;

    s?.emit('leaveGame', joinedRoomRef.current, () => {});
    store.remove(SESSION_KEY);
    store.remove(GAME_KEY);
    if (s) s.auth = { ...s.auth, sessionId: undefined };

    stopGraceCountdown();
    setRoom('');
    setOpponents(0);
    setStatus('Sin conectar');
    setIsOnline(false);
    handlersRef.current.startGame(false); // volver al tablero local con partida limpia
  }, [setIsOnline, setRoom, stopGraceCountdown]);

  const copyId = useCallback(async () => {
    if (!joinedRoom) return;
    try {
      await navigator.clipboard.writeText(joinedRoom);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setStatus('Tu navegador no dejó copiar. Selecciónalo a mano.');
    }
  }, [joinedRoom]);

  /* ---------------- UI ---------------- */
  if (!isOnline) {
    return (
      <section className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="panel-heading">Jugar online</h2>
          <p className="mt-1 text-sm text-slate-400">
            Crea una sala y pásale el código a quien quieras. Sin registro.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            className="field sm:w-44"
            value={roomInput}
            onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
            placeholder="CÓDIGO"
            maxLength={32}
            aria-label="Código de sala"
            disabled={busy}
          />
          <button className="btn-ghost" onClick={joinRoom} disabled={busy || !roomInput}>
            Unirme
          </button>
          <button className="btn-primary" onClick={createRoom} disabled={busy}>
            Crear sala
          </button>
        </div>

        <p className={clsx('text-xs', connected ? 'text-emerald-400' : 'text-slate-500')}>
          {connected ? '● Servidor listo' : `○ ${status}`}
        </p>
      </section>
    );
  }

  return (
    <section className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div>
          <h2 className="panel-heading">Sala</h2>
          <p className="text-2xl font-black tracking-[0.3em] text-radar">{joinedRoom || '—'}</p>
        </div>
        <button className="btn-ghost text-xs" onClick={copyId} disabled={!joinedRoom}>
          {copied ? 'Copiado' : 'Copiar código'}
        </button>
      </div>

      <div className="flex-1 text-center">
        <p className="text-sm font-semibold text-slate-200">{status}</p>
        <p className="text-xs text-slate-500">
          {opponents < 2 ? 'Comparte el código para que entre tu rival' : 'Sala completa'}
          {grace > 0 && ` · ${grace}s para que vuelva`}
        </p>
        {opponents < 2 && (
          <div className="mx-auto mt-2 h-8 w-8 overflow-hidden rounded-full border border-radar/30">
            <div className="radar-sweep h-full w-full animate-sweep" aria-hidden="true" />
          </div>
        )}
      </div>

      <button className="btn-danger" onClick={leaveRoom}>Salir</button>
    </section>
  );
};

export default OnlineMode;
