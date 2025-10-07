import React, { useState, useEffect, useRef } from 'react';
import Board from './components/Board';
import OnlineMode from './components/OnlineMode';

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

  const playerGridRef = useRef(playerGrid);
  const playerShipsRef = useRef(playerShips);

  useEffect(() => { playerGridRef.current = playerGrid; }, [playerGrid]);
  useEffect(() => { playerShipsRef.current = playerShips; }, [playerShips]);

  const startGame = () => {
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

    const initialShots = mode === 'oneShotPerShip' ? shipsConfig.length : 1;
    setPendingShots(initialShots);
    setPlayerTurn(isOnline ? isMyTurnOnline : true);
  };

  useEffect(() => { startGame(); }, [mode, difficulty, isOnline]);

  // --- ONLINE MODE CALLBACKS ---
  const updateOpponentGrid = (row, col, result) => {
    setOpponentGrid(prev => {
      const newGrid = prev.map(r => r.map(c => ({ ...c })));
      newGrid[row][col].hit = true;
      newGrid[row][col].result = result; // <-- usar 'result' en vez de 'type'
      return newGrid;
    });
    setPlayerTurn(false);
    setPendingShots(0);
  };

  const handleIncomingShot = (row, col, callback) => {
    const { newGrid, newShips, result, allSunk } = applyShot(playerGridRef.current, playerShipsRef.current, row, col);
    setPlayerGrid(newGrid);
    setPlayerShips(newShips);
    setPlayerTurn(false);
    setMessage(`💥 El enemigo disparó (${row},${col})! Resultado: ${result}`);
    if (allSunk) { setGameOver(true); setMessage('😵 ¡Perdiste la partida!'); }
    callback(result, allSunk);
  };

  const switchOnlineTurn = (isMyTurn) => {
    setIsMyTurnOnline(isMyTurn);
    setPlayerTurn(isMyTurn);
    setPendingShots(isMyTurn ? (mode === 'oneShotPerShip' ? shipsConfig.length : 1) : 0);
  };

  // --- HANDLE PLAYER SHOT ---
  const handlePlayerShot = (row, col) => {
    if (gameOver || !playerTurn || pendingShots <= 0) return;

    if (isOnline && socketInstance) {
      socketInstance.emit('playerShot', { row, col });
      updateOpponentGrid(row, col, 'sent');
      return;
    }

    if (botGrid[row][col].hit) return;
    const { newGrid, newShips, result, allSunk } = applyShot(botGrid, botShips, row, col);
    setBotGrid(newGrid);
    setBotShips(newShips);

    setMessage(result === 'agua' ? '💦 Agua.' : result === 'tocado' ? '🎯 ¡Tocado!' : '💥 ¡Hundiste un barco!');
    if (result === 'hundido' && mode === 'oneShotPerShip') setBotShotsLeft(prev => Math.max(prev - 1, 0));
    if (allSunk) { setMessage('🏆 ¡Ganaste la partida!'); setGameOver(true); return; }

    setPendingShots(prev => prev - 1);
  };

  // --- BOT TURN ---
  useEffect(() => {
    if (pendingShots === 0 && playerTurn && !gameOver && !isOnline) {
      setTimeout(() => {
        setPlayerTurn(false);
        handleBotTurn(mode === 'oneShotPerShip' ? botShotsLeft : 1);
      }, 800);
    }
  }, [pendingShots, playerTurn, gameOver, isOnline]);

  const handleBotTurn = (shotsRemaining) => {
    if (shotsRemaining <= 0 || gameOver) {
      setPlayerTurn(true);
      setPendingShots(mode === 'oneShotPerShip' ? playerShotsLeft : 1);
      return;
    }

    const currentGrid = playerGridRef.current;
    const currentShips = playerShipsRef.current;
    let row, col;

    const getAvailableCells = () => currentGrid.flatMap((r, i) => r.map((c, j) => (!c.hit ? [i, j] : null))).filter(Boolean);

    if (difficulty === 'easy') {
      [row, col] = getAvailableCells()[Math.floor(Math.random() * getAvailableCells().length)];
    } else if (difficulty === 'medium') {
      const target = currentGrid.flatMap((r, i) => r.map((c, j) => c.hit && c.hasShip ? [i, j] : null)).filter(Boolean)[0];
      if (target) {
        const [tr, tc] = target;
        const neighbors = [[tr + 1, tc], [tr - 1, tc], [tr, tc + 1], [tr, tc - 1]].filter(([r, c]) => r >= 0 && r < 10 && c >= 0 && c < 10 && !currentGrid[r][c].hit);
        if (neighbors.length) [row, col] = neighbors[Math.floor(Math.random() * neighbors.length)];
      }
      if (row === undefined) [row, col] = getAvailableCells()[Math.floor(Math.random() * getAvailableCells().length)];
    } else if (difficulty === 'hard') {
      let targetCells = [];
      const damagedShip = currentShips.find(s => s.hits > 0 && s.hits < s.size);
      if (damagedShip) targetCells = damagedShip.positions.filter(([r, c]) => !currentGrid[r][c].hit);
      if (!targetCells.length) targetCells = getAvailableCells().filter((_, i) => i % 2 === 0);
      if (!targetCells.length) targetCells = getAvailableCells();
      [row, col] = targetCells[Math.floor(Math.random() * targetCells.length)];
    }

    const { newGrid, newShips, result, allSunk } = applyShot(currentGrid, currentShips, row, col);
    setPlayerGrid(newGrid);
    setPlayerShips(newShips);

    setMessage(result === 'agua' ? 'La máquina falló 💨' : result === 'tocado' ? 'La máquina te dio 😬' : 'La máquina te hundió un barco 😵');
    if (result === 'hundido' && mode === 'oneShotPerShip') setPlayerShotsLeft(prev => Math.max(prev - 1, 0));
    if (allSunk) { setMessage('😵 ¡Perdiste la partida!'); setGameOver(true); return; }

    setTimeout(() => handleBotTurn(shotsRemaining - 1), 500);
  };

  return (
  <div className="min-h-screen bg-gradient-to-br from-blue-200 to-blue-500 p-4 sm:p-8 text-center space-y-6">
    <h1 className="text-4xl sm:text-5xl font-extrabold text-white drop-shadow mb-4">🚢 Battleship</h1>

    {/* Controles de modo/dificultad y modo online */}
    <div className="mb-4 flex flex-col sm:flex-row gap-4 justify-center items-center">
      {!isOnline && (
        <>
          <select
            value={mode}
            onChange={e => {
              if (!gameOver && !window.confirm('¿Cambiar modo y reiniciar partida?')) return;
              setMode(e.target.value);
            }}
            className="bg-white text-blue-700 px-3 py-2 rounded shadow focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="normal">Normal</option>
            <option value="oneShotPerShip">Un disparo por barco</option>
            <option value="fogOfWar">Niebla de guerra</option>
          </select>

          <select
            value={difficulty}
            onChange={e => {
              if (!gameOver && !window.confirm('¿Cambiar dificultad y reiniciar partida?')) return;
              setDifficulty(e.target.value);
            }}
            className="bg-white text-blue-700 px-3 py-2 rounded shadow focus:outline-none focus:ring-2 focus:ring-blue-500"
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
      />
    </div>

    {/* Información de partida solo en modo local */}
    {!isOnline && (
      <div className="flex justify-center gap-6 items-center text-white font-semibold text-lg sm:text-xl">
        {mode === 'oneShotPerShip' && (
          <span>🎯 Disparos restantes: {pendingShots}</span>
        )}
        <span>💥 Modo: {mode === 'normal' ? 'Normal' : mode === 'oneShotPerShip' ? 'Un disparo por barco' : 'Niebla de guerra'}</span>
        <span>⚡ Turno: {playerTurn ? 'Tú' : 'Bot'}</span>
      </div>
    )}

    {/* Tableros */}
    <div className="flex flex-col lg:flex-row items-center justify-center gap-6">
      <div className="bg-white/70 rounded-2xl shadow-lg p-4 w-full sm:w-auto">
        <h2 className="text-lg sm:text-xl font-bold text-blue-900 mb-2">🌊 Tu tablero</h2>
        <Board grid={playerGrid} isPlayer={true} mode={mode} />
      </div>

      <div className="bg-white/70 rounded-2xl shadow-lg p-4 w-full sm:w-auto">
        <h2 className="text-lg sm:text-xl font-bold text-red-700 mb-2">🎯 Tablero enemigo</h2>
        <Board
          grid={isOnline ? opponentGrid : botGrid}
          isPlayer={false}
          onCellClick={handlePlayerShot}
          mode={mode}
        />
      </div>
    </div>

    {/* Mensaje de estado */}
    {message && (
      <div
        role="status"
        aria-live="polite"
        className="text-lg sm:text-xl font-semibold text-gray-800 bg-white py-2 px-4 rounded shadow inline-block transition-colors duration-300"
      >
        {message}
      </div>
    )}

    {/* Botón reiniciar partida */}
    {gameOver && (
      <button
        onClick={startGame}
        className="bg-blue-700 text-white px-6 py-2 rounded-lg text-lg font-bold hover:bg-blue-800 shadow focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        🔄 Reiniciar partida
      </button>
    )}
  </div>
);

};

export default App;
