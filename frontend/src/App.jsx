import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import Board from './components/Board';
import PlacementBoard from './components/PlacementBoard';
import FleetStatus from './components/FleetStatus';
import OnlineMode from './components/OnlineMode';
import AudioController from './components/AudioController';
import useSound from './hooks/useSound';
import {
  TOTAL_SHIPS,
  createEmptyBoard,
  placeShips,
  applyShot,
  markShot,
  shipsRemaining,
  fleetPayload,
  cellLabel,
} from './game/logic';
import { randomRoster, rosterToFleet, rosterComplete } from './game/placement';
import { chooseBotShot } from './game/bot';
import { MODE_LIST, DIFFICULTY_LIST, getMode, shotsFor } from './game/modes';

const BOT_FIRST_DELAY = 700;
const BOT_SHOT_DELAY = 650;

const emptyFleet = () => placeShips();

const App = () => {
  const [mode, setMode] = useState('normal');
  const [difficulty, setDifficulty] = useState('medium');

  const [playerGrid, setPlayerGrid] = useState(() => createEmptyBoard());
  const [playerShips, setPlayerShips] = useState([]);
  const [botGrid, setBotGrid] = useState(() => createEmptyBoard());
  const [botShips, setBotShips] = useState([]);

  const [phase, setPhase] = useState('placing');   // 'placing' | 'playing'
  const [roster, setRoster] = useState(() => randomRoster());
  const [turn, setTurn] = useState('player');       // 'player' | 'bot' | 'waiting'
  const [pendingShots, setPendingShots] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [outcome, setOutcome] = useState(null);      // 'win' | 'lose' | null
  const [message, setMessage] = useState(null);      // { text, tone }
  const [lastPlayerShot, setLastPlayerShot] = useState(null);
  const [lastBotShot, setLastBotShot] = useState(null);

  // --- Modo online ---
  const [isOnline, setIsOnline] = useState(false);
  const [opponentGrid, setOpponentGrid] = useState(() => createEmptyBoard());
  const [onlineShips, setOnlineShips] = useState({ mine: TOTAL_SHIPS, theirs: TOTAL_SHIPS });
  const [restart, setRestart] = useState({ waiting: false, opponentWants: false });
  const [socketInstance, setSocketInstance] = useState(null);
  const [room, setRoom] = useState('');

  const {
    isMuted, setIsMuted, volume, setVolume,
    playWaterSound, playExplosionSound, playHitSound, playSinkSound,
    playVictorySound, playDefeatSound, playClickSound,
  } = useSound();

  const modeConfig = getMode(mode);

  // Refs con el estado más reciente: el bot dispara en cadena con temporizadores
  // y necesita ver el tablero actualizado sin esperar a un re-render.
  const playerGridRef = useRef(playerGrid);
  const playerShipsRef = useRef(playerShips);
  const modeRef = useRef(mode);
  const difficultyRef = useRef(difficulty);
  const gameOverRef = useRef(gameOver);
  const isOnlineRef = useRef(isOnline);
  const rosterRef = useRef(roster);
  const roomRef = useRef(room);
  const timersRef = useRef([]);

  playerGridRef.current = playerGrid;
  playerShipsRef.current = playerShips;
  modeRef.current = mode;
  difficultyRef.current = difficulty;
  gameOverRef.current = gameOver;
  isOnlineRef.current = isOnline;
  rosterRef.current = roster;
  roomRef.current = room;

  /** setTimeout con registro, para poder cancelarlos todos al reiniciar o desmontar. */
  const schedule = useCallback((fn, delay) => {
    const id = setTimeout(() => {
      timersRef.current = timersRef.current.filter(t => t !== id);
      fn();
    }, delay);
    timersRef.current.push(id);
    return id;
  }, []);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const say = useCallback((text, tone = 'info') => setMessage({ text, tone }), []);

  /**
   * Abre una partida nueva en la fase de colocación. La flota del jugador no
   * queda fijada hasta que confirma en `confirmPlacement`.
   */
  const startGame = useCallback(() => {
    clearTimers();

    const bot = emptyFleet();
    setBotGrid(bot.board);
    setBotShips(bot.ships);

    // Se conserva la última disposición: repetir partida es un clic, y quien
    // quiera recolocar sigue teniendo el tablero delante.
    setRoster(prev => (rosterComplete(prev) ? prev : randomRoster()));

    setPlayerGrid(createEmptyBoard());
    setPlayerShips([]);
    playerGridRef.current = createEmptyBoard();
    playerShipsRef.current = [];

    setOpponentGrid(createEmptyBoard());
    setOnlineShips({ mine: TOTAL_SHIPS, theirs: TOTAL_SHIPS });

    setPhase('placing');
    setTurn('waiting');
    setPendingShots(0);
    setGameOver(false);
    setOutcome(null);
    setMessage(null);
    setLastPlayerShot(null);
    setLastBotShot(null);
    setRestart({ waiting: false, opponentWants: false });
  }, [clearTimers]);

  /**
   * El jugador da por buena su flota: se fija el tablero y empieza la partida.
   * En online es el momento de mandarla al servidor, que la valida.
   */
  const confirmPlacement = useCallback(() => {
    const current = rosterRef.current;
    if (!rosterComplete(current)) return;

    playClickSound();
    const fleet = rosterToFleet(current);
    setPlayerGrid(fleet.board);
    setPlayerShips(fleet.ships);
    playerGridRef.current = fleet.board;
    playerShipsRef.current = fleet.ships;
    setPhase('playing');

    if (isOnlineRef.current) {
      setTurn('waiting');
      setPendingShots(0);
      say('Flota desplegada. Esperando al rival…');
      socketInstance?.emit(
        'sendBoard',
        { gameId: roomRef.current, ships: fleetPayload(fleet.ships) },
        (res) => { if (res?.error) say(res.error, 'bad'); }
      );
      return;
    }

    setTurn('player');
    setPendingShots(shotsFor(modeRef.current, TOTAL_SHIPS));
  }, [playClickSound, say, socketInstance]);

  // Cambiar de modo o de dificultad reparte partida nueva.
  // Entrar y salir de una sala online lo gestiona OnlineMode llamando a startGame.
  useEffect(() => {
    startGame();
  }, [mode, difficulty, startGame]);

  const finish = useCallback((won, text) => {
    clearTimers();
    setGameOver(true);
    setOutcome(won ? 'win' : 'lose');
    setTurn('waiting');
    setPendingShots(0);
    say(text, won ? 'win' : 'lose');
    (won ? playVictorySound : playDefeatSound)();
  }, [clearTimers, say, playVictorySound, playDefeatSound]);

  const playResultSound = useCallback((result, fromBot = false) => {
    if (result === 'agua') playWaterSound();
    else if (result === 'tocado') (fromBot ? playExplosionSound : playHitSound)();
    else if (result === 'hundido') playSinkSound();
  }, [playWaterSound, playExplosionSound, playHitSound, playSinkSound]);

  /* ======================= TURNO DEL BOT ======================= */

  const endBotTurn = useCallback(() => {
    if (gameOverRef.current) return;
    setTurn('player');
    setPendingShots(shotsFor(modeRef.current, shipsRemaining(playerShipsRef.current)));
  }, []);

  const botShoot = useCallback((shotsLeft) => {
    if (gameOverRef.current) return;
    if (shotsLeft <= 0) return endBotTurn();

    const shot = chooseBotShot(playerGridRef.current, difficultyRef.current);
    if (!shot) return endBotTurn();

    const [row, col] = shot;
    const res = applyShot(playerGridRef.current, playerShipsRef.current, row, col);
    if (res.repeated) return endBotTurn();

    // Actualizar refs antes que el estado: el siguiente disparo encadenado
    // tiene que ver este impacto aunque React no haya re-renderizado todavía.
    playerGridRef.current = res.board;
    playerShipsRef.current = res.ships;
    setPlayerGrid(res.board);
    setPlayerShips(res.ships);
    setLastBotShot({ row, col });

    playResultSound(res.result, true);
    const where = cellLabel(row, col);
    say(
      res.result === 'agua' ? `El rival falla en ${where}.`
        : res.result === 'tocado' ? `El rival te ha tocado en ${where}.`
          : `El rival te hunde el ${res.sunkShip.size === 5 ? 'portaaviones' : 'barco'} (${where}).`,
      res.result === 'agua' ? 'info' : 'bad'
    );

    if (res.allSunk) return finish(false, 'Tu flota ha sido hundida. Derrota.');
    schedule(() => botShoot(shotsLeft - 1), BOT_SHOT_DELAY);
  }, [endBotTurn, finish, playResultSound, say, schedule]);

  const startBotTurn = useCallback(() => {
    if (gameOverRef.current) return;
    setTurn('bot');
    const shots = shotsFor(modeRef.current, shipsRemaining(playerShipsRef.current));
    schedule(() => botShoot(shots), BOT_FIRST_DELAY);
  }, [botShoot, schedule]);

  /* ======================= DISPARO DEL JUGADOR ======================= */

  const fireOnline = useCallback((row, col) => {
    if (!socketInstance) return;
    setPendingShots(0);
    socketInstance.emit('playerShot', { row, col }, (res) => {
      if (res?.error) {
        say(res.error, 'bad');
        setPendingShots(1); // el disparo no contó, devolvemos el turno
      }
    });
  }, [socketInstance, say]);

  const handlePlayerShot = useCallback((row, col) => {
    if (phase !== 'playing' || gameOver || turn !== 'player' || pendingShots <= 0) return;

    if (isOnline) return fireOnline(row, col);

    const res = applyShot(botGrid, botShips, row, col);
    if (res.repeated) return;

    setBotGrid(res.board);
    setBotShips(res.ships);
    setLastPlayerShot({ row, col });
    playResultSound(res.result);

    const hidden = modeConfig.hideResults;
    const where = cellLabel(row, col);
    say(
      hidden ? `Disparo lanzado sobre ${where}. Sin confirmación.`
        : res.result === 'agua' ? `Agua en ${where}.`
          : res.result === 'tocado' ? `¡Tocado en ${where}!`
            : `¡Hundido! Has dado con un barco de ${res.sunkShip.size}.`,
      hidden ? 'info' : res.result === 'agua' ? 'info' : 'good'
    );

    if (res.allSunk) return finish(true, '¡Flota enemiga hundida! Victoria.');

    if (modeConfig.loseOnMiss && res.result === 'agua') {
      return finish(false, 'Has fallado. En hardcore no hay segunda oportunidad.');
    }

    const left = pendingShots - 1;
    setPendingShots(left);
    if (left <= 0) startBotTurn();
  }, [
    phase, gameOver, turn, pendingShots, isOnline, fireOnline, botGrid, botShips,
    playResultSound, modeConfig, say, finish, startBotTurn,
  ]);

  /* ======================= CALLBACKS DEL MODO ONLINE ======================= */

  const online = useMemo(() => ({
    /** El servidor confirma el resultado de mi disparo. */
    onShotFeedback: ({ row, col, result, sunkShip, allSunk, opponentShipsRemaining, myShipsRemaining }) => {
      setOpponentGrid(prev => markShot(prev, row, col, result, sunkShip));
      setLastPlayerShot({ row, col });
      setOnlineShips({ mine: myShipsRemaining, theirs: opponentShipsRemaining });
      playResultSound(result);

      if (allSunk) return finish(true, '¡Has hundido la flota rival! Victoria.');
      const where = cellLabel(row, col);
      say(
        result === 'agua' ? `Agua en ${where}.`
          : result === 'tocado' ? `¡Tocado en ${where}!`
            : '¡Barco rival hundido!',
        result === 'agua' ? 'info' : 'good'
      );
    },

    /** El rival me ha disparado; el servidor ya calculó el resultado. */
    onIncomingShot: ({ row, col, result, sunkShip, allSunk, myShipsRemaining, opponentShipsRemaining }) => {
      setPlayerGrid(prev => markShot(prev, row, col, result, sunkShip));
      setLastBotShot({ row, col });
      setOnlineShips({ mine: myShipsRemaining, theirs: opponentShipsRemaining });
      playResultSound(result, true);

      if (allSunk) return finish(false, 'Tu flota ha caído. Derrota.');
      const where = cellLabel(row, col);
      say(
        result === 'agua' ? `El rival falla en ${where}.`
          : result === 'tocado' ? `El rival te ha tocado en ${where}.`
            : 'El rival te ha hundido un barco.',
        result === 'agua' ? 'info' : 'bad'
      );
    },

    onBeginTurn: (isMine) => {
      setTurn(isMine ? 'player' : 'waiting');
      setPendingShots(isMine ? 1 : 0);
    },

    onGameOver: (iWon) => {
      if (iWon) return; // ya lo anunció shotFeedback
      finish(false, 'Tu flota ha caído. Derrota.');
    },

    onRestartState: (next) => setRestart(prev => ({ ...prev, ...next })),

    setRoom,
    startGame,
    say,
  }), [finish, playResultSound, say, startGame]);

  /* ======================= REINICIO ONLINE ======================= */

  const requestRestart = useCallback(() => {
    if (!socketInstance) return;
    playClickSound();
    setRestart(prev => ({ ...prev, waiting: true }));
    socketInstance.emit('requestRestart', null, (res) => {
      if (res?.error) {
        say(res.error, 'bad');
        setRestart(prev => ({ ...prev, waiting: false }));
      } else if (res?.waiting) {
        say('Esperando a que el rival acepte la revancha…');
      }
    });
  }, [socketInstance, playClickSound, say]);

  const cancelRestart = useCallback(() => {
    if (!socketInstance) return;
    playClickSound();
    setRestart({ waiting: false, opponentWants: false });
    socketInstance.emit('cancelRestart', null, () => {});
  }, [socketInstance, playClickSound]);

  /* ======================= CAMBIOS DE CONFIGURACIÓN ======================= */

  const inProgress = phase === 'playing' && !gameOver && (lastPlayerShot || lastBotShot);

  const changeSetting = useCallback((setter, value, current) => {
    if (value === current) return;
    playClickSound();
    if (inProgress && !window.confirm('Hay una partida en curso. ¿Reiniciarla?')) return;
    setter(value);
  }, [inProgress, playClickSound]);

  const enemyBoard = isOnline ? opponentGrid : botGrid;
  // Durante el despliegue la flota está intacta; playerShips aún está vacío
  const myShipsLeft = isOnline ? onlineShips.mine
    : phase === 'placing' ? TOTAL_SHIPS
      : shipsRemaining(playerShips);
  const enemyShipsLeft = isOnline ? onlineShips.theirs : shipsRemaining(botShips);
  const myTurn = phase === 'playing' && turn === 'player' && !gameOver;
  const placing = phase === 'placing';

  const toneClass = {
    good: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
    bad: 'border-orange-400/40 bg-orange-400/10 text-orange-200',
    win: 'border-emerald-400/60 bg-emerald-400/15 text-emerald-100',
    lose: 'border-rose-400/60 bg-rose-400/15 text-rose-100',
    info: 'border-white/15 bg-white/5 text-slate-200',
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-5 px-3 py-5 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-[0.2em] text-slate-50 sm:text-4xl">
            Battleship
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {isOnline ? 'Duelo online' : `${modeConfig.icon} ${modeConfig.label} · ${modeConfig.hint}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="btn-ghost"
            onClick={() => { playClickSound(); if (!isOnline) startGame(); }}
            disabled={isOnline}
            title={isOnline ? 'En online el reinicio lo acordáis los dos' : 'Volver a colocar la flota y empezar de cero'}
          >
            Nueva partida
          </button>
          <AudioController
            isMuted={isMuted} setIsMuted={setIsMuted}
            volume={volume} setVolume={setVolume}
          />
        </div>
      </header>

      {/* ---- Configuración ---- */}
      {!isOnline && (
        <section className="panel flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:gap-8">
          <div className="flex-1">
            <h2 className="panel-heading mb-2">Modo de juego</h2>
            <div className="flex flex-wrap gap-2">
              {MODE_LIST.map(m => (
                <button
                  key={m.id}
                  onClick={() => changeSetting(setMode, m.id, mode)}
                  aria-pressed={mode === m.id}
                  title={m.hint}
                  className={clsx(
                    'btn text-xs',
                    mode === m.id
                      ? 'bg-radar text-abyss shadow-glow'
                      : 'border border-white/15 bg-white/5 text-slate-300 hover:border-radar/50 hover:bg-white/10'
                  )}
                >
                  <span aria-hidden="true">{m.icon}</span> {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h2 className="panel-heading mb-2">Rival</h2>
            <div className="flex flex-wrap gap-2">
              {DIFFICULTY_LIST.map(d => (
                <button
                  key={d.id}
                  onClick={() => changeSetting(setDifficulty, d.id, difficulty)}
                  aria-pressed={difficulty === d.id}
                  title={d.hint}
                  className={clsx(
                    'btn text-xs',
                    difficulty === d.id
                      ? 'bg-radar text-abyss shadow-glow'
                      : 'border border-white/15 bg-white/5 text-slate-300 hover:border-radar/50 hover:bg-white/10'
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      <OnlineMode
        isOnline={isOnline}
        setIsOnline={setIsOnline}
        setSocketInstance={setSocketInstance}
        online={online}
      />

      {/* ---- Marcador ---- */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Stat
          label="Turno"
          value={placing ? 'Despliegue' : gameOver ? 'Final' : myTurn ? 'Tuyo' : 'Del rival'}
          accent={myTurn || placing}
        />
        <Stat label="Disparos este turno" value={myTurn ? pendingShots : '—'} />
        <Stat label="Tu flota" value={`${myShipsLeft}/${TOTAL_SHIPS}`} />
        <Stat label="Flota enemiga" value={`${enemyShipsLeft}/${TOTAL_SHIPS}`} />
      </section>

      {/* ---- Mensaje de estado ---- */}
      <div aria-live="polite" role="status" className="min-h-[3.25rem]">
        {message && (
          <div className={clsx(
            'animate-rise-in rounded-xl border px-4 py-3 text-center text-sm font-semibold sm:text-base',
            toneClass[message.tone] ?? toneClass.info
          )}>
            {message.text}
          </div>
        )}
      </div>

      {/* ---- Colocación de la flota ---- */}
      {placing && (
        <PlacementBoard
          roster={roster}
          setRoster={setRoster}
          onConfirm={confirmPlacement}
          title="Despliega tu flota"
          subtitle={isOnline
            ? 'Coloca tus barcos y confirma: el rival no verá dónde están.'
            : 'Coloca tus cinco barcos donde quieras antes de empezar.'}
          confirmLabel={isOnline ? 'Enviar flota' : 'Empezar partida'}
        />
      )}

      {/* ---- Tableros ---- */}
      {!placing && (
      <main className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-start lg:gap-6">
        <section className="panel p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-300">Tus aguas</h2>
            <span className="text-xs text-slate-500">Defiende</span>
          </div>
          <Board grid={playerGrid} isPlayer lastShot={lastBotShot} />
        </section>

        <aside className="flex flex-row gap-3 lg:w-56 lg:flex-col">
          <div className="flex-1">
            <FleetStatus
              title="Tus barcos"
              ships={isOnline ? null : playerShips}
              remaining={isOnline ? onlineShips.mine : null}
            />
          </div>
          <div className="flex-1">
            <FleetStatus
              title="Barcos rivales"
              ships={isOnline || modeConfig.hideResults ? null : botShips}
              remaining={isOnline ? onlineShips.theirs : modeConfig.hideResults ? TOTAL_SHIPS : null}
              tone="sunk"
            />
          </div>
        </aside>

        <section className={clsx('panel p-3 sm:p-4', !myTurn && !gameOver && 'opacity-80')}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-300">
              Aguas enemigas
            </h2>
            <span className="text-xs text-slate-500">
              {myTurn ? 'Elige objetivo' : gameOver ? 'Partida terminada' : 'Espera tu turno'}
            </span>
          </div>
          <Board
            grid={enemyBoard}
            onFire={handlePlayerShot}
            disabled={!myTurn}
            hideResults={!isOnline && modeConfig.hideResults}
            revealAll={gameOver}
            lastShot={lastPlayerShot}
          />
          <p className="mt-3 text-center text-[0.7rem] text-slate-500">
            Usa el ratón o muévete con las flechas y dispara con Enter
          </p>
        </section>
      </main>
      )}

      {/* ---- Final de partida ---- */}
      {gameOver && (
        <section className="animate-rise-in panel flex flex-col items-center gap-3 p-5 text-center">
          <p className={clsx(
            'text-2xl font-black uppercase tracking-widest',
            outcome === 'win' ? 'text-emerald-300' : 'text-rose-300'
          )}>
            {outcome === 'win' ? 'Victoria' : 'Derrota'}
          </p>

          {!isOnline && (
            <button className="btn-primary" onClick={() => { playClickSound(); startGame(); }}>
              Jugar otra vez
            </button>
          )}

          {isOnline && <OnlineEndgame
            restart={restart}
            onRequest={requestRestart}
            onCancel={cancelRestart}
          />}
        </section>
      )}

      <footer className="pb-2 text-center text-xs text-slate-600">
        Hecho con React · el rival juega solo con la información que tú también tienes
      </footer>
    </div>
  );
};

const Stat = ({ label, value, accent = false }) => (
  <div className={clsx(
    'panel px-3 py-2.5 transition-colors',
    accent && 'border-radar/50 bg-radar/10'
  )}>
    <p className="panel-heading">{label}</p>
    <p className={clsx(
      'mt-0.5 text-lg font-bold tabular sm:text-xl',
      accent ? 'text-radar' : 'text-slate-100'
    )}>
      {value}
    </p>
  </div>
);

const OnlineEndgame = ({ restart, onRequest, onCancel }) => {
  if (restart.waiting && restart.opponentWants) {
    return <p className="text-sm font-semibold text-radar">Los dos aceptasteis. Reiniciando…</p>;
  }
  if (restart.waiting) {
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm text-slate-400">Esperando respuesta del rival…</p>
        <button className="btn-ghost" onClick={onCancel}>Cancelar</button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2">
      {restart.opponentWants && (
        <p className="text-sm font-semibold text-emerald-300">El rival quiere la revancha</p>
      )}
      <button className="btn-primary" onClick={onRequest}>
        {restart.opponentWants ? 'Aceptar revancha' : 'Pedir revancha'}
      </button>
    </div>
  );
};

export default App;
