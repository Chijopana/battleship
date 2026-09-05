/**
 * Lógica pura del juego. Sin React, sin efectos: entra estado, sale estado nuevo.
 * Esto permite testearla y reutilizarla entre el modo local y el online.
 */

export const BOARD_SIZE = 10;

/**
 * La flota, en orden. Cada barco tiene nombre propio: había dos de eslora 3 y
 * llamar "Submarino" a los dos hacía imposible referirse a uno en concreto.
 */
export const SHIP_CLASSES = [
  { size: 5, name: 'Portaaviones' },
  { size: 4, name: 'Acorazado' },
  { size: 3, name: 'Crucero' },
  { size: 3, name: 'Submarino' },
  { size: 2, name: 'Destructor' },
];

export const SHIP_SIZES = SHIP_CLASSES.map(s => s.size);
export const TOTAL_SHIPS = SHIP_CLASSES.length;

/** Tablero vacío de BOARD_SIZE x BOARD_SIZE. */
export const createEmptyBoard = () =>
  Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => ({ hasShip: false, hit: false, sunk: false }))
  );

const cloneBoard = (board) => board.map(row => row.map(cell => ({ ...cell })));

const cloneShips = (ships) =>
  ships.map(ship => ({ ...ship, positions: ship.positions.map(([r, c]) => [r, c]) }));

export const inBounds = (row, col) =>
  Number.isInteger(row) && Number.isInteger(col) &&
  row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;

/**
 * Coloca la flota al azar. Devuelve { board, ships }.
 * `ships[i] = { size, positions, hits, sunk }`.
 */
export const placeShips = (sizes = SHIP_SIZES, random = Math.random) => {
  const board = createEmptyBoard();
  const ships = [];

  for (const size of sizes) {
    let placed = false;
    let guard = 0;

    while (!placed && guard++ < 1000) {
      const horizontal = random() < 0.5;
      const row = Math.floor(random() * BOARD_SIZE);
      const col = Math.floor(random() * BOARD_SIZE);
      if ((horizontal ? col + size : row + size) > BOARD_SIZE) continue;

      const positions = Array.from({ length: size }, (_, i) => [
        row + (horizontal ? 0 : i),
        col + (horizontal ? i : 0),
      ]);

      if (positions.some(([r, c]) => board[r][c].hasShip)) continue;

      positions.forEach(([r, c]) => { board[r][c].hasShip = true; });
      ships.push({ size, name: SHIP_CLASSES[ships.length]?.name ?? `Barco ${size}`, positions, hits: 0, sunk: false });
      placed = true;
    }

    if (!placed) throw new Error(`No se pudo colocar un barco de tamaño ${size}`);
  }

  return { board, ships };
};

/**
 * Aplica un disparo. Devuelve un estado nuevo (no muta la entrada).
 * `result` es 'agua' | 'tocado' | 'hundido'; `repeated` marca un disparo ya hecho.
 */
export const applyShot = (board, ships, row, col) => {
  if (!inBounds(row, col) || board[row][col].hit) {
    return { board, ships, result: null, repeated: true, sunkShip: null, allSunk: false };
  }

  const newBoard = cloneBoard(board);
  const newShips = cloneShips(ships);
  newBoard[row][col].hit = true;

  const ship = newShips.find(s => s.positions.some(([r, c]) => r === row && c === col));
  let result = 'agua';
  let sunkShip = null;

  if (ship) {
    ship.hits += 1;
    result = 'tocado';
    if (ship.hits === ship.size) {
      ship.sunk = true;
      result = 'hundido';
      sunkShip = ship;
      // Marcar todo el barco como hundido para que la UI lo pinte distinto
      ship.positions.forEach(([r, c]) => { newBoard[r][c].sunk = true; });
    }
  }

  return {
    board: newBoard,
    ships: newShips,
    result,
    repeated: false,
    sunkShip,
    allSunk: newShips.every(s => s.sunk),
  };
};

/**
 * Marca en un tablero el resultado que reporta el servidor (modo online).
 * Vale para el tablero enemigo y para el propio: solo toca hit/result/sunk,
 * nunca hasShip, así que el veredicto del servidor manda sobre lo que cree el cliente.
 */
export const markShot = (board, row, col, result, sunkShip = null) => {
  if (!inBounds(row, col)) return board;
  const newBoard = cloneBoard(board);
  newBoard[row][col].hit = true;
  newBoard[row][col].result = result;

  if (result === 'hundido' && Array.isArray(sunkShip)) {
    sunkShip.forEach(([r, c]) => {
      if (!inBounds(r, c)) return;
      newBoard[r][c].hit = true;
      newBoard[r][c].result = 'hundido';
      newBoard[r][c].sunk = true;
    });
  }
  return newBoard;
};

export const shipsRemaining = (ships) => ships.filter(s => !s.sunk).length;

/** Serializa la flota para enviarla al servidor (sin estado de daño). */
export const fleetPayload = (ships) =>
  ships.map(({ size, positions }) => ({ size, positions: positions.map(([r, c]) => [r, c]) }));

/** Etiqueta legible de una casilla: A1 … J10. */
export const cellLabel = (row, col) => `${String.fromCharCode(65 + col)}${row + 1}`;
