import React, { useState, useEffect } from 'react';
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
  const [playerGrid, setPlayerGrid] = useState(createEmptyBoard());
  const [botGrid, setBotGrid] = useState(createEmptyBoard());
  const [playerShips, setPlayerShips] = useState([]);
  const [botShips, setBotShips] = useState([]);
  const [message, setMessage] = useState('');
  const [gameOver, setGameOver] = useState(false);

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
  };

  useEffect(() => {
    startGame();
  }, []);

  const handlePlayerShot = (row, col) => {
    if (gameOver || botGrid[row][col].hit) return;

    const { newGrid, newShips, result, allSunk } = applyShot(botGrid, botShips, row, col);
    setBotGrid(newGrid);
    setBotShips(newShips);

    if (result === 'agua') {
      setMessage('💦 Agua.');
    } else if (result === 'tocado') {
      setMessage('🎯 ¡Tocado!');
    } else if (result === 'hundido') {
      setMessage('💥 ¡Hundiste un barco!');
    }

    if (allSunk) {
      setMessage('🏆 ¡Ganaste la partida!');
      setGameOver(true);
      return;
    }

    setTimeout(() => {
      handleBotShot();
    }, 800);
  };

  const handleBotShot = () => {
    const available = [];
    for (let i = 0; i < playerGrid.length; i++) {
      for (let j = 0; j < playerGrid[i].length; j++) {
        if (!playerGrid[i][j].hit) {
          available.push([i, j]);
        }
      }
    }

    const [row, col] = available[Math.floor(Math.random() * available.length)];

    const { newGrid, newShips, result, allSunk } = applyShot(playerGrid, playerShips, row, col);
    setPlayerGrid(newGrid);
    setPlayerShips(newShips);

    if (result === 'agua') {
      setMessage('La máquina falló 💨');
    } else if (result === 'tocado') {
      setMessage('La máquina te dio 😬');
    } else if (result === 'hundido') {
      setMessage('La máquina te hundió un barco 😵');
    }

    if (allSunk) {
      setMessage('😵 ¡Perdiste la partida!');
      setGameOver(true);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-200 to-blue-500 p-8 text-center">
      <h1 className="text-5xl font-extrabold text-white drop-shadow mb-8">🚢 Battleship</h1>
      <div className="flex justify-center gap-16">
  <div className="bg-white/70 rounded-2xl shadow-lg p-4">
    <h2 className="text-xl font-bold text-blue-900 mb-2">🌊 Tu tablero</h2>
    <Board grid={playerGrid} isPlayer={true} />
  </div>
  <div className="bg-white/70 rounded-2xl shadow-lg p-4">
    <h2 className="text-xl font-bold text-red-700 mb-2">🎯 Tablero enemigo</h2>
    <Board grid={botGrid} isPlayer={false} onCellClick={handlePlayerShot} />
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
