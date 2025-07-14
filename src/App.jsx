import React, { useState, useEffect, useRef } from 'react';
import Board from './components/Board';

const createEmptyBoard = () => {
  return Array(10).fill(null).map(() =>
    Array(10).fill(null).map(() => ({
      hasShip: false,
      hit: false,
    }))
  );
};

const placeShips = (board, ships) => {
  const newBoard = board.map(row => row.map(cell => ({ ...cell })));
  const shipList = [];

  for (let size of ships) {
    let placed = false;

    while (!placed) {
      const isHorizontal = Math.random() < 0.5;
      const row = Math.floor(Math.random() * 10);
      const col = Math.floor(Math.random() * 10);

      const fits = isHorizontal ? col + size <= 10 : row + size <= 10;
      if (!fits) continue;

      let overlap = false;
      const positions = [];

      for (let i = 0; i < size; i++) {
        const r = row + (isHorizontal ? 0 : i);
        const c = col + (isHorizontal ? i : 0);
        if (newBoard[r][c].hasShip) {
          overlap = true;
          break;
        }
        positions.push([r, c]);
      }

      if (overlap) continue;

      for (let [r, c] of positions) {
        newBoard[r][c].hasShip = true;
      }

      shipList.push({ size, positions, hits: 0 });
      placed = true;
    }
  }

  return { board: newBoard, ships: shipList };
};

const applyShot = (grid, ships, row, col) => {
  const newGrid = grid.map(row => row.map(cell => ({ ...cell })));
  const newShips = ships.map(ship => ({ ...ship, positions: [...ship.positions] }));
  let result = 'agua';

  newGrid[row][col].hit = true;

  if (newGrid[row][col].hasShip) {
    result = 'tocado';

    for (let ship of newShips) {
      if (ship.positions.some(([r, c]) => r === row && c === col)) {
        ship.hits += 1;
        if (ship.hits === ship.size) {
          result = 'hundido';
        }
        break;
      }
    }
  }

  const allSunk = newShips.every(ship => ship.hits === ship.size);

  return { newGrid, newShips, result, allSunk };
};

const App = () => {
  const [mode, setMode] = useState('normal');
  const [playerShotsLeft, setPlayerShotsLeft] = useState(5);
  const [botShotsLeft, setBotShotsLeft] = useState(5);
  const [playerTurn, setPlayerTurn] = useState(true);
  const [pendingShots, setPendingShots] = useState(0);

  const [playerGrid, setPlayerGrid] = useState(createEmptyBoard());
  const [botGrid, setBotGrid] = useState(createEmptyBoard());
  const [playerShips, setPlayerShips] = useState([]);
  const [botShips, setBotShips] = useState([]);
  const [message, setMessage] = useState('');
  const [gameOver, setGameOver] = useState(false);

  const playerGridRef = useRef(playerGrid);
  const playerShipsRef = useRef(playerShips);

  useEffect(() => {
    playerGridRef.current = playerGrid;
  }, [playerGrid]);

  useEffect(() => {
    playerShipsRef.current = playerShips;
  }, [playerShips]);

  const startGame = () => {
    const ships = [5, 4, 3, 3, 2];
    const player = placeShips(createEmptyBoard(), ships);
    const bot = placeShips(createEmptyBoard(), ships);
    setPlayerGrid(player.board);
    setPlayerShips(player.ships);
    setBotGrid(bot.board);
    setBotShips(bot.ships);
    setMessage('');
    setGameOver(false);
    setPlayerShotsLeft(ships.length);
    setBotShotsLeft(ships.length);
    setPlayerTurn(true);
    setPendingShots(mode === 'oneShotPerShip' ? ships.length : 1);
  };

  useEffect(() => {
    startGame();
  }, [mode]);

  const handlePlayerShot = (row, col) => {
    if (gameOver || !playerTurn || botGrid[row][col].hit || pendingShots <= 0) return;

    const { newGrid, newShips, result, allSunk } = applyShot(botGrid, botShips, row, col);
    setBotGrid(newGrid);
    setBotShips(newShips);

    if (mode !== 'hard') {
      if (result === 'agua') setMessage('💦 Agua.');
      if (result === 'tocado') setMessage('🎯 ¡Tocado!');
      if (result === 'hundido') setMessage('💥 ¡Hundiste un barco!');
    }

    if (result === 'hundido' && mode === 'oneShotPerShip') {
  setBotShotsLeft(prev => Math.max(prev - 1, 0));  // CORREGIDO: se quita disparo al bot
}

    if (allSunk) {
      setMessage('🏆 ¡Ganaste la partida!');
      setGameOver(true);
      return;
    }

    setPendingShots(prev => prev - 1);
  };

  useEffect(() => {
    if (pendingShots === 0 && playerTurn && !gameOver) {
      setTimeout(() => {
        setPlayerTurn(false);
        const botShots = mode === 'oneShotPerShip' ? botShotsLeft : 1;
        handleBotTurn(botShots);
      }, 800);
    }
  }, [pendingShots, playerTurn, gameOver]);

  const handleBotTurn = (shotsRemaining) => {
    if (shotsRemaining <= 0 || gameOver) {
      setPlayerTurn(true);
      const playerRemaining = mode === 'oneShotPerShip' ? playerShotsLeft : 1;
      setPendingShots(playerRemaining);
      return;
    }

    // Usa el estado más actualizado desde refs
    const currentGrid = playerGridRef.current;
    const currentShips = playerShipsRef.current;

    const available = [];
    for (let i = 0; i < currentGrid.length; i++) {
      for (let j = 0; j < currentGrid[i].length; j++) {
        if (!currentGrid[i][j].hit) {
          available.push([i, j]);
        }
      }
    }

    if (available.length === 0) return;

    const [row, col] = available[Math.floor(Math.random() * available.length)];

    // Clona para no mutar
    const tempGrid = currentGrid.map(row => row.map(cell => ({ ...cell })));
    const tempShips = currentShips.map(ship => ({ ...ship, positions: [...ship.positions] }));

    const { newGrid, newShips, result, allSunk } = applyShot(tempGrid, tempShips, row, col);

    // Actualiza estados usando función para evitar batch
    setPlayerGrid(newGrid);
    setPlayerShips(newShips);

    if (result === 'agua') setMessage('La máquina falló 💨');
    if (result === 'tocado') setMessage('La máquina te dio 😬');
    if (result === 'hundido') {
      setMessage('La máquina te hundió un barco 😵');
      if (mode === 'oneShotPerShip') {
        setPlayerShotsLeft(prev => Math.max(prev - 1, 0));  // CORREGIDO: se quita disparo a ti
      }
    }

    if (allSunk) {
      setMessage('😵 ¡Perdiste la partida!');
      setGameOver(true);
      return;
    }

    setTimeout(() => {
      handleBotTurn(shotsRemaining - 1);
    }, 500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-200 to-blue-500 p-8 text-center">
      <h1 className="text-5xl font-extrabold text-white drop-shadow mb-8">🚢 Battleship</h1>
      <div className="mb-6">
        <button
          onClick={() => {
            if (!gameOver) {
              const confirmRestart = window.confirm('¿Cambiar modo y reiniciar partida?');
              if (!confirmRestart) return;
            }
            setMode(prev =>
              prev === 'normal' ? 'oneShotPerShip' : prev === 'oneShotPerShip' ? 'hard' : 'normal'
            );
          }}
          className="bg-white text-blue-700 px-4 py-2 rounded shadow hover:bg-blue-100"
        >
          Cambiar modo ({mode})
        </button>
      </div>
      <div className="flex justify-center gap-16">
        <div className="bg-white/70 rounded-2xl shadow-lg p-4">
          <h2 className="text-xl font-bold text-blue-900 mb-2">🌊 Tu tablero</h2>
          <Board grid={playerGrid} isPlayer={true} mode={mode} />
        </div>
        <div className="bg-white/70 rounded-2xl shadow-lg p-4">
          <h2 className="text-xl font-bold text-red-700 mb-2">🎯 Tablero enemigo</h2>
          <Board grid={botGrid} isPlayer={false} onCellClick={handlePlayerShot} mode={mode} />
        </div>
      </div>

      {message && (
        <div className="mt-6 text-xl font-semibold text-gray-800 bg-white py-2 px-4 rounded shadow inline-block">
          {message}
        </div>
      )}

      {gameOver && (
        <div className="mt-6">
          <button
            onClick={startGame}
            className="bg-blue-700 text-white px-6 py-2 rounded-lg text-lg font-bold hover:bg-blue-800 shadow"
          >
            🔄 Reiniciar partida
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
