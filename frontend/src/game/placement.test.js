import { describe, it, expect } from 'vitest';
import { BOARD_SIZE, SHIP_SIZES } from './logic';
import {
  canPlace,
  createRoster,
  fillRemaining,
  findSpot,
  isPlaced,
  placedCount,
  randomRoster,
  rosterComplete,
  rosterToBoard,
  rosterToFleet,
  shipAt,
  shipCells,
  withShipAt,
  withShipRemoved,
} from './placement';

const seeded = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

/** Roster con el portaaviones (5) horizontal en la fila 0 desde la columna 0. */
const withCarrier = () => withShipAt(createRoster(), 0, 0, 0, true);

describe('roster', () => {
  it('arranca con los cinco huecos vacíos', () => {
    const roster = createRoster();
    expect(roster).toHaveLength(SHIP_SIZES.length);
    expect(roster.map(s => s.size)).toEqual(SHIP_SIZES);
    expect(placedCount(roster)).toBe(0);
    expect(rosterComplete(roster)).toBe(false);
  });

  it('shipCells cubre la eslora en la orientación pedida', () => {
    expect(shipCells(3, 2, 4, true)).toEqual([[2, 4], [2, 5], [2, 6]]);
    expect(shipCells(3, 2, 4, false)).toEqual([[2, 4], [3, 4], [4, 4]]);
  });
});

describe('canPlace', () => {
  it('acepta una posición libre y dentro del tablero', () => {
    expect(canPlace(createRoster(), 0, 3, 3, true)).toBe(true);
  });

  it('rechaza si el barco se sale por la derecha o por abajo', () => {
    const roster = createRoster();
    expect(canPlace(roster, 0, 0, BOARD_SIZE - 4, true)).toBe(false); // eslora 5
    expect(canPlace(roster, 0, BOARD_SIZE - 4, 0, false)).toBe(false);
  });

  it('rechaza coordenadas negativas', () => {
    expect(canPlace(createRoster(), 0, -1, 0, true)).toBe(false);
  });

  it('rechaza si pisa otro barco ya colocado', () => {
    const roster = withCarrier(); // fila 0, columnas 0-4
    expect(canPlace(roster, 1, 0, 2, true)).toBe(false);  // cruza el portaaviones
    expect(canPlace(roster, 1, 0, 5, true)).toBe(true);   // justo al lado, sin pisarlo
    expect(canPlace(roster, 1, 1, 0, true)).toBe(true);   // fila de abajo
  });

  it('un barco no choca consigo mismo al moverlo', () => {
    const roster = withCarrier();
    expect(canPlace(roster, 0, 0, 1, true)).toBe(true); // desplazado una columna
  });
});

describe('colocar y quitar', () => {
  it('withShipAt fija las casillas y la orientación', () => {
    const roster = withShipAt(createRoster(), 2, 4, 4, false); // eslora 3, vertical
    const ship = roster.find(s => s.id === 2);
    expect(ship.positions).toEqual([[4, 4], [5, 4], [6, 4]]);
    expect(ship.horizontal).toBe(false);
    expect(isPlaced(ship)).toBe(true);
  });

  it('withShipAt no cambia nada si la posición no vale', () => {
    const roster = createRoster();
    expect(withShipAt(roster, 0, 0, 9, true)).toBe(roster);
  });

  it('withShipRemoved devuelve el barco al muelle', () => {
    const roster = withShipRemoved(withCarrier(), 0);
    expect(placedCount(roster)).toBe(0);
    expect(shipAt(roster, 0, 0)).toBeNull();
  });

  it('shipAt identifica qué barco ocupa una casilla', () => {
    const roster = withCarrier();
    expect(shipAt(roster, 0, 3).id).toBe(0);
    expect(shipAt(roster, 1, 3)).toBeNull();
  });
});

describe('findSpot', () => {
  it('devuelve la misma casilla si ahí cabe', () => {
    expect(findSpot(createRoster(), 0, 2, 2, true)).toEqual([2, 2]);
  });

  it('retrocede cuando la rotación se saldría del tablero', () => {
    // Portaaviones (5) apuntando abajo desde la fila 7: no cabe, hay que subir
    const spot = findSpot(createRoster(), 0, 7, 0, false);
    expect(spot).toEqual([5, 0]);
  });

  it('devuelve null si no hay hueco de ninguna manera', () => {
    // Llenar la columna 0 con los otros barcos bloquea la vertical
    let roster = createRoster();
    roster = withShipAt(roster, 1, 0, 0, false); // 4 en filas 0-3
    roster = withShipAt(roster, 2, 4, 0, false); // 3 en filas 4-6
    roster = withShipAt(roster, 3, 7, 0, false); // 3 en filas 7-9
    expect(findSpot(roster, 0, 9, 0, false)).toBeNull();
  });
});

describe('rellenar al azar', () => {
  it('randomRoster deja la flota completa y sin solapamientos', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const roster = randomRoster(seeded(seed));
      expect(rosterComplete(roster)).toBe(true);

      const taken = new Set();
      for (const ship of roster) {
        for (const [r, c] of ship.positions) {
          expect(taken.has(`${r},${c}`)).toBe(false);
          taken.add(`${r},${c}`);
        }
      }
      expect(taken.size).toBe(SHIP_SIZES.reduce((a, b) => a + b, 0));
    }
  });

  it('fillRemaining respeta los barcos ya colocados', () => {
    const roster = withCarrier();
    const filled = fillRemaining(roster, seeded(3));

    expect(rosterComplete(filled)).toBe(true);
    // El portaaviones sigue exactamente donde estaba
    expect(filled.find(s => s.id === 0).positions).toEqual([[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]]);
  });

  it('la orientación que devuelve randomRoster coincide con las casillas', () => {
    const roster = randomRoster(seeded(11));
    for (const ship of roster) {
      const rows = new Set(ship.positions.map(([r]) => r));
      expect(ship.horizontal).toBe(rows.size === 1);
    }
  });
});

describe('paso a flota de juego', () => {
  it('rosterToBoard marca las casillas ocupadas', () => {
    const board = rosterToBoard(withCarrier());
    expect(board[0][0].hasShip).toBe(true);
    expect(board[0][4].hasShip).toBe(true);
    expect(board[0][5].hasShip).toBe(false);
  });

  it('rosterToFleet produce barcos listos para recibir disparos', () => {
    const { board, ships } = rosterToFleet(randomRoster(seeded(5)));

    expect(ships).toHaveLength(SHIP_SIZES.length);
    ships.forEach(ship => {
      expect(ship.hits).toBe(0);
      expect(ship.sunk).toBe(false);
      expect(ship.positions).toHaveLength(ship.size);
      ship.positions.forEach(([r, c]) => expect(board[r][c].hasShip).toBe(true));
    });
  });
});
