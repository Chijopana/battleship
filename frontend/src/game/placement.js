/**
 * Colocación manual de la flota.
 *
 * Durante esta fase la flota es un "roster": cinco huecos con su eslora, su
 * orientación y, si ya está colocado, sus casillas. Cuando está completo se
 * convierte en la flota de juego que entiende `applyShot`.
 */
import { BOARD_SIZE, SHIP_CLASSES, SHIP_SIZES, createEmptyBoard, placeShips, inBounds } from './logic';

/** Roster vacío: un hueco por barco, todos horizontales y sin colocar. */
export const createRoster = () =>
  SHIP_CLASSES.map(({ size, name }, id) => ({ id, size, name, horizontal: true, positions: [] }));

/** Casillas que ocuparía un barco de esa eslora en esa posición y orientación. */
export const shipCells = (size, row, col, horizontal) =>
  Array.from({ length: size }, (_, i) => [
    row + (horizontal ? 0 : i),
    col + (horizontal ? i : 0),
  ]);

export const isPlaced = (ship) => ship.positions.length === ship.size;

export const rosterComplete = (roster) => roster.every(isPlaced);

export const placedCount = (roster) => roster.filter(isPlaced).length;

/** Casillas ocupadas por el resto de la flota, para detectar solapamientos. */
const occupiedBy = (roster, exceptId) => {
  const taken = new Set();
  for (const ship of roster) {
    if (ship.id === exceptId) continue;
    ship.positions.forEach(([r, c]) => taken.add(`${r},${c}`));
  }
  return taken;
};

/** ¿Cabe ese barco ahí, sin salirse y sin pisar a otro? */
export const canPlace = (roster, shipId, row, col, horizontal) => {
  const ship = roster.find(s => s.id === shipId);
  if (!ship) return false;

  const cells = shipCells(ship.size, row, col, horizontal);
  if (!cells.every(([r, c]) => inBounds(r, c))) return false;

  const taken = occupiedBy(roster, shipId);
  return cells.every(([r, c]) => !taken.has(`${r},${c}`));
};

/** Coloca (o mueve) un barco. Devuelve el roster original si la posición no vale. */
export const withShipAt = (roster, shipId, row, col, horizontal) => {
  if (!canPlace(roster, shipId, row, col, horizontal)) return roster;
  return roster.map(ship =>
    ship.id === shipId
      ? { ...ship, horizontal, positions: shipCells(ship.size, row, col, horizontal) }
      : ship
  );
};

/** Devuelve un barco al muelle. */
export const withShipRemoved = (roster, shipId) =>
  roster.map(ship => (ship.id === shipId ? { ...ship, positions: [] } : ship));

export const emptyRoster = (roster) => roster.map(ship => ({ ...ship, positions: [] }));

/** Qué barco ocupa una casilla, si es que hay alguno. */
export const shipAt = (roster, row, col) =>
  roster.find(ship => ship.positions.some(([r, c]) => r === row && c === col)) ?? null;

/**
 * Busca el primer sitio libre para un barco a partir de una casilla.
 * Se usa al rotar: si la rotación no cabe, se prueba a desplazarla un poco
 * antes de rendirse, que es lo que uno espera al pulsar "rotar".
 */
export const findSpot = (roster, shipId, row, col, horizontal) => {
  if (canPlace(roster, shipId, row, col, horizontal)) return [row, col];

  const ship = roster.find(s => s.id === shipId);
  if (!ship) return null;

  // Retroceder por el eje del barco: al rotar cerca del borde suele bastar
  for (let shift = 1; shift < ship.size; shift++) {
    const r = horizontal ? row : row - shift;
    const c = horizontal ? col - shift : col;
    if (inBounds(r, c) && canPlace(roster, shipId, r, c, horizontal)) return [r, c];
  }
  return null;
};

/** Tablero pintable a partir del roster (para previsualizar la colocación). */
export const rosterToBoard = (roster) => {
  const board = createEmptyBoard();
  for (const ship of roster) {
    ship.positions.forEach(([r, c]) => {
      if (inBounds(r, c)) board[r][c].hasShip = true;
    });
  }
  return board;
};

/** Convierte el roster en la flota de juego, con contador de impactos. */
export const rosterToFleet = (roster) => ({
  board: rosterToBoard(roster),
  ships: roster.map(({ size, name, positions }) => ({
    size,
    name,
    positions: positions.map(([r, c]) => [r, c]),
    hits: 0,
    sunk: false,
  })),
});

/** Roster completo colocado al azar, reutilizando el repartidor del juego. */
export const randomRoster = (random = Math.random) => {
  const { ships } = placeShips(SHIP_SIZES, random);
  return ships.map((ship, id) => {
    const rows = new Set(ship.positions.map(([r]) => r));
    return {
      id,
      size: ship.size,
      name: SHIP_CLASSES[id]?.name ?? ship.name,
      horizontal: rows.size === 1,
      positions: ship.positions.map(([r, c]) => [r, c]),
    };
  });
};

/** Coloca al azar solo los barcos que falten, respetando los ya puestos. */
export const fillRemaining = (roster, random = Math.random) => {
  let result = roster;

  for (const ship of roster) {
    if (isPlaced(ship)) continue;

    const options = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        for (const horizontal of [true, false]) {
          if (canPlace(result, ship.id, row, col, horizontal)) options.push([row, col, horizontal]);
        }
      }
    }
    if (options.length === 0) return null; // sin hueco: hay que empezar de cero

    const [row, col, horizontal] = options[Math.floor(random() * options.length)];
    result = withShipAt(result, ship.id, row, col, horizontal);
  }

  return result;
};
