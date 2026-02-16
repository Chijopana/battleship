import React, { useState, useEffect, useRef } from 'react';
import Board from './components/Board';
import OnlineMode from './components/OnlineMode';
import AudioController from './components/AudioController';
import useSound from './hooks/useSound';

const createEmptyBoard = () =>
  Array(10).fill(null).map(() =>
    Array(10).fill(null).map(() => ({ hasShip: false, hit: false }))
  );

const placeShips = (board, ships) => {
  const newBoard = board.map(row => row.map(cell => ({ ...cell })));
  const shipList = [];

  for (let size of ships) {
    let placed = false;
    while (!placed) {
      const isHorizontal = Math.random() < 0.5;
      const row = Math.floor(Math.random() * 10);
      const col = Math.floor(Math.random() * 10);
      if ((isHorizontal ? col + size : row + size) > 10) continue;

      const positions = [];
      let overlap = false;
      for (let i = 0; i < size; i++) {
        const r = row + (isHorizontal ? 0 : i);
        const c = col + (isHorizontal ? i : 0);
        if (newBoard[r][c].hasShip) { overlap = true; break; }
        positions.push([r, c]);
      }
      if (overlap) continue;

      positions.forEach(([r, c]) => newBoard[r][c].hasShip = true);
      shipList.push({ size, positions, hits: 0 });
      placed = true;
    }
  }

  return { board: newBoard, ships: shipList };
};

const applyShot = (grid, ships, row, col) => {
  const newGrid = grid.map(r => r.map(c => ({ ...c })));
  const newShips = ships.map(ship => ({ ...ship, positions: [...ship.positions] }));
  let result = 'agua';

  newGrid[row][col].hit = true;

  for (let ship of newShips) {
    if (ship.positions.some(([r, c]) => r === row && c === col)) {
      ship.hits += 1;
      result = ship.hits === ship.size ? 'hundido' : 'tocado';
      break;
    }
  }

  return { newGrid, newShips, result, allSunk: newShips.every(s => s.hits === s.size) };
};

const App = () => {
  const shipsConfig = [5, 4, 3, 3, 2];

  const [mode, setMode] = useState('normal');
  const [difficulty, setDifficulty] = useState('easy');
  const [playerTurn, setPlayerTurn] = useState(true);
  const [pendingShots, setPendingShots] = useState(1);
  const [playerShotsLeft, setPlayerShotsLeft] = useState(shipsConfig.length);
  const [botShotsLeft, setBotShotsLeft] = useState(shipsConfig.length);
  const [playerGrid, setPlayerGrid] = useState(createEmptyBoard());
  const [botGrid, setBotGrid] = useState(createEmptyBoard());
  const [playerShips, setPlayerShips] = useState([]);
  const [botShips, setBotShips] = useState([]);
  const [message, setMessage] = useState('');
  const [gameOver, setGameOver] = useState(false);

  // Online Mode
  const [isOnline, setIsOnline] = useState(false);
  const [opponentGrid, setOpponentGrid] = useState(createEmptyBoard());
  const [isMyTurnOnline, setIsMyTurnOnline] = useState(false);
  const [socketInstance, setSocketInstance] = useState(null);
  const [waitingForOpponentRestart, setWaitingForOpponentRestart] = useState(false);
  const [opponentWantsRestart, setOpponentWantsRestart] = useState(false);

  // Estadísticas
  const [playerShipsSunk, setPlayerShipsSunk] = useState(0);
  const [botShipsSunk, setBotShipsSunk] = useState(0);
  const [hardcoreErrors, setHardcoreErrors] = useState(0); // Errores en modo hardcore

  // Sistema de sonido
  const {
    isMuted,
    setIsMuted,
    volume,
    setVolume,
    playWaterSound,
    playExplosionSound,
    playHitSound,
    playSinkSound,
    playVictorySound,
    playDefeatSound,
    playClickSound,
  } = useSound();

  const playerGridRef = useRef(playerGrid);
  const playerShipsRef = useRef(playerShips);
  const lastShotTimeRef = useRef(0);
  const botExecutingRef = useRef(false); // Prevenir múltiples disparos simultáneos

  useEffect(() => { playerGridRef.current = playerGrid; }, [playerGrid]);
  useEffect(() => { playerShipsRef.current = playerShips; }, [playerShips]);

  const startGame = React.useCallback(() => {
    const player = placeShips(createEmptyBoard(), shipsConfig);
    const bot = placeShips(createEmptyBoard(), shipsConfig);

    setPlayerGrid(player.board);
    setPlayerShips(player.ships);
    setBotGrid(bot.board);
    setBotShips(bot.ships);
    setOpponentGrid(createEmptyBoard());

    setMessage('');
    setGameOver(false);
    setPlayerShotsLeft(shipsConfig.length);
    setBotShotsLeft(shipsConfig.length);
    setPlayerShipsSunk(0);
    setBotShipsSunk(0);
    setHardcoreErrors(0);

    // Calcular disparos iniciales según el modo
    let initialShots = 1;
    if (mode === 'oneShotPerShip') initialShots = shipsConfig.length;
    else if (mode === 'rapidFire') initialShots = 3;
    else if (mode === 'hardcore') initialShots = 2;
    
    setPendingShots(initialShots);
    
    // En modo online, no iniciar el turno hasta que el servidor lo indique
    if (isOnline) {
      setPlayerTurn(false);
      setIsMyTurnOnline(false);
    } else {
      setPlayerTurn(true);
    }
  }, [mode, isOnline]);

  useEffect(() => { 
    startGame(); 
  }, [startGame, mode, difficulty, isOnline]);

  // --- ONLINE MODE CALLBACKS ---
  const updateOpponentGrid = (row, col, resultType) => {
    setOpponentGrid(prev => {
      if (!prev) return prev;
      const newGrid = prev.map(r => r.map(c => ({ ...c })));
      if (newGrid[row] && newGrid[row][col]) {
        newGrid[row][col].hit = true;
        newGrid[row][col].type = resultType;
      }
      return newGrid;
    });
  };

  const handleIncomingShot = (row, col, callback) => {
    const { newGrid, newShips, result, allSunk } = applyShot(playerGridRef.current, playerShipsRef.current, row, col);
    setPlayerGrid(newGrid);
    setPlayerShips(newShips);
    setPlayerTurn(false);
    setMessage(`💥 El enemigo disparó (${row},${col})! Resultado: ${result}`);
    if (allSunk) { 
      setGameOver(true); 
      setMessage('😵 ¡Perdiste la partida!'); 
    }
    if (callback) callback(result, allSunk);
  };

  const switchOnlineTurn = (isMyTurn) => {
    setIsMyTurnOnline(isMyTurn);
    setPlayerTurn(isMyTurn);
    setPendingShots(isMyTurn ? 1 : 0);
  };

  // --- ONLINE RESTART FUNCTIONS ---
  const handleRequestRestart = React.useCallback(() => {
    if (!socketInstance || !isOnline) return;
    
    playClickSound();
    setWaitingForOpponentRestart(true);
    
    socketInstance.emit('requestRestart', null, (res) => {
      if (res?.error) {
        console.error('[Error] Error al solicitar reinicio:', res.error);
        setMessage('❌ ' + res.error);
        setWaitingForOpponentRestart(false);
      } else if (res?.restarted) {
        // Reinicio exitoso, startGame se llamará desde el listener gameRestarted
        console.log('[✅ Reinicio] Partida reiniciada por ambos');
      } else if (res?.waiting) {
        setMessage('⏳ Esperando que el rival acepte reiniciar...');
      }
    });
  }, [socketInstance, isOnline, playClickSound]);

  const handleCancelRestart = React.useCallback(() => {
    if (!socketInstance || !isOnline) return;
    
    playClickSound();
    setWaitingForOpponentRestart(false);
    setOpponentWantsRestart(false);
    
    socketInstance.emit('cancelRestart', null, (res) => {
      console.log('[❌ Reinicio] Reinicio cancelado');
    });
  }, [socketInstance, isOnline, playClickSound]);

  const handleLeaveOnlineGame = React.useCallback(() => {
    if (!socketInstance || !isOnline) return;
    
    playClickSound();
    
    if (!window.confirm('¿Salir de la partida online?')) return;
    
    socketInstance.emit('leaveGame', null, (res) => {
      console.log('[👋 Leave] Saliendo de partida online');
      setIsOnline(false);
      setWaitingForOpponentRestart(false);
      setOpponentWantsRestart(false);
      startGame();
    });
  }, [socketInstance, isOnline, playClickSound, startGame]);

  // --- HANDLE PLAYER SHOT ---
  const handlePlayerShot = (row, col) => {
    if (gameOver || !playerTurn || pendingShots <= 0) return;

    if (isOnline && socketInstance) {
      // Prevenir disparos spam
      const now = Date.now();
      if (now - lastShotTimeRef.current < 300) {
        console.warn('[Security] Click muy rápido, ignorando');
        return;
      }
      lastShotTimeRef.current = now;

      // Validar coordenadas en cliente
      if (typeof row !== 'number' || typeof col !== 'number' || row < 0 || row >= 10 || col < 0 || col >= 10) {
        console.error('[Security] Coordenadas inválidas:', row, col);
        return;
      }

      console.log('[PlayerShot] Disparando en línea a:', row, col);
      socketInstance.emit('playerShot', { row, col }, (res) => {
        if (res?.error) {
          console.error('[Error] Error al disparar:', res.error);
          setMessage('❌ ' + res.error);
        }
      });
      return;
    }

    if (botGrid[row][col].hit) return;
    const { newGrid, newShips, result, allSunk } = applyShot(botGrid, botShips, row, col);
    setBotGrid(newGrid);
    setBotShips(newShips);

    // Reproducir sonidos según resultado
    if (result === 'agua') {
      playWaterSound();
    } else if (result === 'tocado') {
      playHitSound();
    } else if (result === 'hundido') {
      playSinkSound();
    }

    setMessage(result === 'agua' ? '💦 Agua.' : result === 'tocado' ? '🎯 ¡Tocado!' : '💥 ¡Hundiste un barco!');
    
    // Contar barcos hundidos
    if (result === 'hundido') {
      setBotShipsSunk(prev => prev + 1);
      if (mode === 'oneShotPerShip') setBotShotsLeft(prev => Math.max(prev - 1, 0));
    }
    
    // En modo hardcore, si fallas pierdes inmediatamente
    if (mode === 'hardcore' && result === 'agua') {
      playDefeatSound();
      setMessage('💀 ¡Fallaste! Game Over en Modo Hardcore');
      setGameOver(true);
      return;
    }
    
    if (allSunk) { 
      playVictorySound();
      setMessage('🏆 ¡Ganaste la partida!'); 
      setGameOver(true); 
      return; 
    }

    setPendingShots(prev => prev - 1);
  };

  // --- BOT TURN (solo en modo local)---
  useEffect(() => {
    if (isOnline || botExecutingRef.current) return; // No activar en modo online ni si está ocupado
    
    if (pendingShots === 0 && playerTurn && !gameOver) {
      botExecutingRef.current = true;
      setTimeout(() => {
        setPlayerTurn(false);
        const shotsForMode = mode === 'oneShotPerShip' ? botShotsLeft : 
                            mode === 'rapidFire' ? 3 :
                            mode === 'hardcore' ? 2 : 1;
        handleBotTurn(shotsForMode);
        botExecutingRef.current = false;
      }, 800);
    }
  }, [pendingShots, playerTurn, gameOver, isOnline, mode, botShotsLeft]);

  const handleBotTurn = (shotsRemaining) => {
    if (shotsRemaining <= 0 || gameOver) {
      setPlayerTurn(true);
      const nextShots = mode === 'oneShotPerShip' ? playerShotsLeft : mode === 'rapidFire' ? 3 : 1;
      setPendingShots(nextShots);
      return;
    }

    const currentGrid = playerGridRef.current;
    const currentShips = playerShipsRef.current;
    let row, col;

    const getAvailableCells = () => currentGrid.flatMap((r, i) => r.map((c, j) => (!c.hit ? [i, j] : null))).filter(Boolean);
    const available = getAvailableCells();
    
    // Protección: si no hay celdas disponibles, acabó el juego
    if (!available || available.length === 0) {
      console.warn('[BotTurn] No hay celdas disponibles - juego debería estar terminado');
      return;
    }

    if (difficulty === 'easy') {
      // Totalmente aleatorio
      [row, col] = available[Math.floor(Math.random() * available.length)];
    } else if (difficulty === 'medium') {
      // Inteligencia básica: si acertó, dispara alrededor
      const hitShipCells = currentGrid.flatMap((r, i) => r.map((c, j) => c.hit && c.hasShip ? [i, j] : null)).filter(Boolean);
      
      if (hitShipCells.length > 0) {
        // Si hay algún barco tocado, enfocarse en él
        const [lastHit] = hitShipCells[hitShipCells.length - 1];
        const [tr, tc] = lastHit;
        const neighbors = [
          [tr + 1, tc], [tr - 1, tc], [tr, tc + 1], [tr, tc - 1]
        ].filter(([r, c]) => r >= 0 && r < 10 && c >= 0 && c < 10 && !currentGrid[r][c].hit);
        
        if (neighbors.length > 0) {
          [row, col] = neighbors[Math.floor(Math.random() * neighbors.length)];
        } else {
          const available = getAvailableCells();
          [row, col] = available[Math.floor(Math.random() * available.length)];
        }
      } else {
        // Si no hay nada tocado, dispara en patrón
        const patternCells = available.filter((_, i) => i % 3 === 0);
        [row, col] = patternCells.length > 0 ? patternCells[Math.floor(Math.random() * patternCells.length)] : available[Math.floor(Math.random() * available.length)];
      }
    } else if (difficulty === 'hard') {
      // IA Avanzada: estrategia óptima
      const hitShipCells = currentGrid.flatMap((r, i) => r.map((c, j) => c.hit && c.hasShip ? [i, j] : null)).filter(Boolean);
      const missedCells = currentGrid.flatMap((r, i) => r.map((c, j) => c.hit && !c.hasShip ? [i, j] : null)).filter(Boolean);
      
      // 1. Si hay un barco parcialmente hundido, termínalo
      let targetCells = [];
      const damagedShip = currentShips.find(s => s.hits > 0 && s.hits < s.size);
      if (damagedShip) {
        targetCells = damagedShip.positions.filter(([r, c]) => !currentGrid[r][c].hit);
      }
      
      // 2. Si hay un barco tocado pero no identificado, busca continuidad
      if (targetCells.length === 0 && hitShipCells.length > 0) {
        const [lastHit] = hitShipCells[hitShipCells.length - 1];
        const [tr, tc] = lastHit;
        targetCells = [
          [tr + 1, tc], [tr - 1, tc], [tr, tc + 1], [tr, tc - 1]
        ].filter(([r, c]) => r >= 0 && r < 10 && c >= 0 && c < 10 && !currentGrid[r][c].hit);
      }
      
      // 3. Si no hay nada, usa patrón inteligente (evita áreas conocidas como agua)
      if (targetCells.length === 0) {
        const wateredAreas = new Set(missedCells.map(([r, c]) => `${r},${c}`));
        const smartCells = available
          .filter(([r, c]) => !wateredAreas.has(`${r},${c}`))
          .filter((_, i) => i % 2 === 0); // Patrón de tablero
        targetCells = smartCells.length > 0 ? smartCells : available;
      }
      
      [row, col] = targetCells[Math.floor(Math.random() * targetCells.length)];
    }

    // Validar que tenemos coordenadas válidas
    if (row === undefined || col === undefined) {
      console.error('[BotTurn] Coordenadas inválidas - no hay celdas disponibles');
      return;
    }

    const { newGrid, newShips, result, allSunk } = applyShot(currentGrid, currentShips, row, col);
    setPlayerGrid(newGrid);
    setPlayerShips(newShips);

    // Reproducir sonidos del bot
    setTimeout(() => {
      if (result === 'agua') {
        playWaterSound();
      } else if (result === 'tocado') {
        playExplosionSound();
      } else if (result === 'hundido') {
        playSinkSound();
      }
    }, 200);

    setMessage(result === 'agua' ? 'La máquina falló 💨' : result === 'tocado' ? 'La máquina te dio 😬' : 'La máquina te hundió un barco 😵');
    
    if (result === 'hundido') {
      setPlayerShipsSunk(prev => prev + 1);
      if (mode === 'oneShotPerShip') setPlayerShotsLeft(prev => Math.max(prev - 1, 0));
    }
    
    // En modo hardcore, si el bot falla también necesitas hacerlo bien
    // (el bot nunca comete errores en modo hardcore - siempre dispara bien)
    
    if (allSunk) { 
      playDefeatSound();
      setMessage('😵 ¡Perdiste la partida!'); 
      setGameOver(true); 
      return; 
    }

    setTimeout(() => handleBotTurn(shotsRemaining - 1), 500);
  };

  return (
  <div className="min-h-screen bg-gradient-to-br from-blue-200 to-blue-500 p-4 sm:p-8 text-center space-y-6">
    {/* Control de audio */}
    <AudioController 
      isMuted={isMuted} 
      setIsMuted={setIsMuted} 
      volume={volume} 
      setVolume={setVolume} 
    />

    <h1 className="text-4xl sm:text-5xl font-extrabold text-white drop-shadow mb-4">🚢 Battleship</h1>

    {/* Controles de modo/dificultad y modo online */}
    <div className="mb-4 flex flex-col sm:flex-row gap-4 justify-center items-center animate-fade-in">
      {!isOnline && (
        <>
          <select
            value={mode}
            onChange={e => {
              playClickSound();
              if (!gameOver && !window.confirm('¿Cambiar modo y reiniciar partida?')) return;
              setMode(e.target.value);
            }}
            className="bg-gradient-to-r from-white to-blue-50 text-blue-700 px-4 py-2 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold transition-all duration-200 cursor-pointer hover:scale-105"
          >
            <option value="normal">🎯 Normal - 1 disparo</option>
            <option value="oneShotPerShip">💣 Un disparo por barco</option>
            <option value="fogOfWar">🌫️ Niebla de guerra</option>
            <option value="rapidFire">⚡ Disparo rápido - 3/turno</option>
            <option value="hardcore">💀 Modo hardcore</option>
          </select>

          <select
            value={difficulty}
            onChange={e => {
              playClickSound();
              if (!gameOver && !window.confirm('¿Cambiar dificultad y reiniciar partida?')) return;
              setDifficulty(e.target.value);
            }}
            className="bg-gradient-to-r from-white to-blue-50 text-blue-700 px-4 py-2 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold transition-all duration-200 cursor-pointer hover:scale-105"
          >
            <option value="easy">Fácil</option>
            <option value="medium">Medio</option>
            <option value="hard">Difícil</option>
          </select>
        </>
      )}

      <OnlineMode
        setIsOnline={setIsOnline}
        isOnline={isOnline}
        playerGrid={playerGrid}
        startGame={startGame}
        handleIncomingShot={handleIncomingShot}
        switchOnlineTurn={switchOnlineTurn}
        setSocketInstance={setSocketInstance}
        setMessage={setMessage}
        setGameOver={setGameOver}
        setOpponentGrid={setOpponentGrid}
        updateOpponentGrid={updateOpponentGrid}
        setWaitingForOpponentRestart={setWaitingForOpponentRestart}
        setOpponentWantsRestart={setOpponentWantsRestart}
      />
    </div>

    {/* Información de partida - Mejorada */}
    {!isOnline && (
      <div className="flex flex-col sm:flex-row justify-center gap-4 items-center text-white font-semibold text-sm sm:text-lg bg-black/30 backdrop-blur p-4 rounded-xl max-w-4xl mx-auto">
        <div className="flex gap-6 flex-wrap justify-center">
          <div className="bg-blue-600/50 px-4 py-2 rounded-lg">
            <span className="block text-xs sm:text-sm opacity-75">Tu turno</span>
            <span className="text-xl sm:text-2xl">{playerTurn ? '🔥' : '⏳'}</span>
          </div>
          <div className="bg-purple-600/50 px-4 py-2 rounded-lg">
            <span className="block text-xs sm:text-sm opacity-75">Tus barcos</span>
            <span className="text-lg">{shipsConfig.length - playerShipsSunk}/{shipsConfig.length} 🚢</span>
          </div>
          <div className="bg-red-600/50 px-4 py-2 rounded-lg">
            <span className="block text-xs sm:text-sm opacity-75">Barcos enemigos</span>
            <span className="text-lg">{shipsConfig.length - botShipsSunk}/{shipsConfig.length} 🎯</span>
          </div>
          {mode === 'oneShotPerShip' && (
            <div className="bg-yellow-600/50 px-4 py-2 rounded-lg">
              <span className="block text-xs sm:text-sm opacity-75">Disparos</span>
              <span className="text-lg">{pendingShots}/{playerShotsLeft} ⚡</span>
            </div>
          )}
          {mode === 'rapidFire' && (
            <div className="bg-orange-600/50 px-4 py-2 rounded-lg">
              <span className="block text-xs sm:text-sm opacity-75">Disparos rápidos</span>
              <span className="text-lg">{pendingShots}/3 ⚡⚡⚡</span>
            </div>
          )}
          <div className="bg-indigo-600/50 px-4 py-2 rounded-lg">
            <span className="block text-xs sm:text-sm opacity-75">Modo</span>
            <span className="text-sm">{mode === 'normal' ? '🎯 Normal' : mode === 'oneShotPerShip' ? '💣 Disparo' : mode === 'fogOfWar' ? '🌫️ Niebla' : mode === 'rapidFire' ? '⚡ Rápido' : '💀 Hardcore'}</span>
          </div>
        </div>
      </div>
    )}
    
    {isOnline && (
      <div className="flex flex-col justify-center items-center text-white font-semibold text-base sm:text-lg bg-black/30 backdrop-blur p-4 rounded-xl gap-3">
        <div className="flex gap-4 flex-wrap justify-center">
          <div className="bg-blue-600/50 px-4 py-2 rounded-lg">
            <span className="block text-xs opacity-75">Estado</span>
            <span>{playerTurn ? '🔥 Tu turno' : '⏳ Turno rival'}</span>
          </div>
          <div className="bg-purple-600/50 px-4 py-2 rounded-lg">
            <span className="block text-xs opacity-75">Tus barcos</span>
            <span>{shipsConfig.length - playerShipsSunk}/{shipsConfig.length} 🚢</span>
          </div>
          <div className="bg-red-600/50 px-4 py-2 rounded-lg">
            <span className="block text-xs opacity-75">Barcos rivales</span>
            <span>{shipsConfig.length - botShipsSunk}/{shipsConfig.length} 🎯</span>
          </div>
        </div>
      </div>
    )}

    {/* Tableros - Layout mejorado para móvil */}
    <div className="flex flex-col lg:flex-row items-center justify-center gap-4 sm:gap-6 w-full px-2">
      <div className="bg-gradient-to-b from-white/95 to-blue-50/90 backdrop-blur rounded-2xl shadow-xl p-3 sm:p-4 w-full sm:w-auto hover:shadow-2xl transition-all duration-300 transform hover:scale-105">
        <h2 className="text-base sm:text-lg font-bold text-blue-900 mb-3 text-center animate-pulse">🌊 Tu tablero</h2>
        <div className="overflow-stable">
          <Board grid={playerGrid} isPlayer={true} mode={mode} />
        </div>
      </div>

      <div className="hidden lg:flex items-center justify-center">
        <div className="text-5xl animate-bounce" style={{ animationDuration: '3s' }}>⚔️</div>
      </div>

      <div className={`bg-gradient-to-b from-white/95 to-red-50/90 backdrop-blur rounded-2xl shadow-xl p-3 sm:p-4 w-full sm:w-auto transition-all duration-300 transform ${
        !playerTurn && isOnline ? 'opacity-40 pointer-events-none scale-95' : 'hover:shadow-2xl hover:scale-105'
      }`}>
        <h2 className="text-base sm:text-lg font-bold text-red-700 mb-3 text-center animate-pulse">🎯 Tablero enemigo</h2>
        <div className="overflow-stable">
          <Board
            grid={isOnline ? opponentGrid : botGrid}
            isPlayer={false}
            onCellClick={handlePlayerShot}
            mode={mode}
            disabled={isOnline && !playerTurn}
          />
        </div>
      </div>
    </div>

    {/* Mensaje de estado - Mejorado */}
    {message && (
      <div
        role="status"
        aria-live="polite"
        className={`text-base sm:text-lg font-bold py-4 px-8 rounded-xl shadow-2xl transition-all duration-300 inline-block max-w-2xl text-center animate-slide-in transform hover:scale-105 ${
          message.includes('Ganaste') ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-green-600/50' :
          message.includes('Perdiste') ? 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-red-600/50' :
          message.includes('Tocado') ? 'bg-gradient-to-r from-orange-400 to-yellow-500 text-white shadow-yellow-600/50' :
          message.includes('Hundiste') ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-purple-600/50' :
          message.includes('falló') ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-blue-600/50' :
          message.includes('dio') ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-red-600/50' :
          'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-blue-600/50'
        }`}
      >
        {message}
      </div>
    )}

    {/* Botones de reinicio - Diferentes para online y local */}
    {gameOver && !isOnline && (
      <button
        onClick={() => {
          playClickSound();
          startGame();
        }}
        className="bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 text-white px-8 py-3 rounded-xl text-lg font-bold shadow-lg hover:shadow-2xl transform hover:scale-110 active:scale-95 transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-400 animate-wobble"
      >
        🔄 Reiniciar partida
      </button>
    )}

    {/* Botones para modo online */}
    {gameOver && isOnline && (
      <div className="flex flex-col sm:flex-row gap-3 items-center">
        {!waitingForOpponentRestart && !opponentWantsRestart && (
          <>
            <button
              onClick={handleRequestRestart}
              className="bg-gradient-to-r from-green-600 to-green-800 hover:from-green-700 hover:to-green-900 text-white px-6 py-3 rounded-xl text-lg font-bold shadow-lg hover:shadow-2xl transform hover:scale-110 active:scale-95 transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-green-400"
            >
              ✅ Jugar otra vez
            </button>
            <button
              onClick={handleLeaveOnlineGame}
              className="bg-gradient-to-r from-red-600 to-red-800 hover:from-red-700 hover:to-red-900 text-white px-6 py-3 rounded-xl text-lg font-bold shadow-lg hover:shadow-2xl transform hover:scale-110 active:scale-95 transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-red-400"
            >
              👋 Salir
            </button>
          </>
        )}
        
        {waitingForOpponentRestart && !opponentWantsRestart && (
          <div className="flex flex-col sm:flex-row gap-3 items-center">
            <div className="bg-amber-500/20 px-6 py-3 rounded-xl text-amber-900 font-bold animate-pulse">
              ⏳ Esperando respuesta del rival...
            </div>
            <button
              onClick={handleCancelRestart}
              className="bg-gradient-to-r from-gray-600 to-gray-800 hover:from-gray-700 hover:to-gray-900 text-white px-6 py-3 rounded-xl text-base font-bold shadow-lg hover:shadow-2xl transform hover:scale-110 active:scale-95 transition-all duration-200"
            >
              ❌ Cancelar
            </button>
          </div>
        )}

        {opponentWantsRestart && !waitingForOpponentRestart && (
          <div className="flex flex-col sm:flex-row gap-3 items-center">
            <div className="bg-green-500/20 px-6 py-3 rounded-xl text-green-900 font-bold">
              🎮 El rival quiere jugar otra vez
            </div>
            <button
              onClick={handleRequestRestart}
              className="bg-gradient-to-r from-green-600 to-green-800 hover:from-green-700 hover:to-green-900 text-white px-6 py-3 rounded-xl text-lg font-bold shadow-lg hover:shadow-2xl transform hover:scale-110 active:scale-95 transition-all duration-200"
            >
              ✅ Aceptar
            </button>
            <button
              onClick={handleLeaveOnlineGame}
              className="bg-gradient-to-r from-red-600 to-red-800 hover:from-red-700 hover:to-red-900 text-white px-6 py-3 rounded-xl text-base font-bold shadow-lg hover:shadow-2xl transform hover:scale-110 active:scale-95 transition-all duration-200"
            >
              👋 Rechazar y salir
            </button>
          </div>
        )}

        {waitingForOpponentRestart && opponentWantsRestart && (
          <div className="bg-purple-500/20 px-6 py-3 rounded-xl text-purple-900 font-bold animate-pulse">
            🎉 ¡Ambos aceptaron! Reiniciando partida...
          </div>
        )}
      </div>
    )}
  </div>
);

};

export default App;
