import { describe, it, expect } from 'vitest';
import {
  BOARD_SIZE,
  SHIP_SIZES,
  createEmptyBoard,
  placeShips,
  applyShot,
  markShot,
  shipsRemaining,
  fleetPayload,
  cellLabel,
} from './logic';
import { chooseBotShot } from './bot';
import { shotsFor, getMode } from './modes';

/** Generador determinista para que los tests no dependan del azar. */
const seeded = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

/** Flota fija: un barco por fila empezando en la columna 0. */
const fixedFleet = () => {
  const board = createEmptyBoard();
  const ships = SHIP_SIZES.map((size, row) => {
    const positions = Array.from({ length: size }, (_, i) => [row, i]);
    positions.forEach(([r, c]) => { board[r][c].hasShip = true; });
    return { size, positions, hits: 0, sunk: false };
  });
  return { board, ships };
};

describe('placeShips', () => {
  it('coloca la flota completa sin solapamientos ni salirse del tablero', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { board, ships } = placeShips(SHIP_SIZES, seeded(seed));

      expect(ships).toHaveLength(SHIP_SIZES.length);
      expect(ships.map(s => s.size).sort()).toEqual([...SHIP_SIZES].sort());

      const occupied = new Set();
      for (const ship of ships) {
        expect(ship.positions).toHaveLength(ship.size);
        for (const [r, c] of ship.positions) {
          expect(r).toBeGreaterThanOrEqual(0);
          expect(r).toBeLessThan(BOARD_SIZE);
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThan(BOARD_SIZE);
          expect(occupied.has(`${r},${c}`)).toBe(false);
          occupied.add(`${r},${c}`);
          expect(board[r][c].hasShip).toBe(true);
        }
      }

      const totalCells = SHIP_SIZES.reduce((a, b) => a + b, 0);
      expect(occupied.size).toBe(totalCells);
    }
  });

  it('cada barco queda recto y contiguo', () => {
    const { ships } = placeShips(SHIP_SIZES, seeded(7));
    for (const { positions } of ships) {
      const rows = new Set(positions.map(([r]) => r));
      const cols = new Set(positions.map(([, c]) => c));
      expect(rows.size === 1 || cols.size === 1).toBe(true);

      const axis = (rows.size === 1 ? positions.map(([, c]) => c) : positions.map(([r]) => r))
        .sort((a, b) => a - b);
      axis.forEach((v, i) => { if (i) expect(v).toBe(axis[i - 1] + 1); });
    }
  });
});

describe('applyShot', () => {
  it('devuelve agua y no toca el estado original', () => {
    const { board, ships } = fixedFleet();
    const res = applyShot(board, ships, 9, 9);

    expect(res.result).toBe('agua');
    expect(res.allSunk).toBe(false);
    expect(board[9][9].hit).toBe(false); // el original queda intacto
    expect(res.board[9][9].hit).toBe(true);
  });

  it('marca tocado y luego hundido, y pinta todo el barco', () => {
    let { board, ships } = fixedFleet();

    // La patrullera está en la fila 4, columnas 0 y 1
    let res = applyShot(board, ships, 4, 0);
    expect(res.result).toBe('tocado');
    expect(res.board[4][0].sunk).toBe(false);

    res = applyShot(res.board, res.ships, 4, 1);
    expect(res.result).toBe('hundido');
    expect(res.sunkShip.size).toBe(2);
    expect(res.board[4][0].sunk).toBe(true);
    expect(res.board[4][1].sunk).toBe(true);
    expect(shipsRemaining(res.ships)).toBe(SHIP_SIZES.length - 1);
  });

  it('ignora un disparo repetido en vez de contarlo dos veces', () => {
    const { board, ships } = fixedFleet();
    const first = applyShot(board, ships, 0, 0);
    const second = applyShot(first.board, first.ships, 0, 0);

    expect(second.repeated).toBe(true);
    expect(second.result).toBe(null);
    expect(second.ships[0].hits).toBe(1); // sigue siendo un único impacto
  });

  it('rechaza coordenadas fuera del tablero', () => {
    const { board, ships } = fixedFleet();
    expect(applyShot(board, ships, -1, 0).repeated).toBe(true);
    expect(applyShot(board, ships, 0, BOARD_SIZE).repeated).toBe(true);
  });

  it('detecta allSunk cuando cae la flota entera', () => {
    let state = fixedFleet();
    let res = { board: state.board, ships: state.ships, allSunk: false };

    for (const ship of state.ships) {
      for (const [r, c] of ship.positions) {
        res = applyShot(res.board, res.ships, r, c);
      }
    }
    expect(res.allSunk).toBe(true);
    expect(shipsRemaining(res.ships)).toBe(0);
  });
});

describe('markShot', () => {
  it('pinta el barco completo cuando el servidor informa de un hundimiento', () => {
    const board = markShot(createEmptyBoard(), 2, 3, 'hundido', [[2, 3], [2, 4], [2, 5]]);
    expect(board[2][3].result).toBe('hundido');
    expect(board[2][5].sunk).toBe(true);
    expect(board[2][5].hit).toBe(true);
  });

  it('no rompe con coordenadas inválidas', () => {
    const board = createEmptyBoard();
    expect(markShot(board, 99, 0, 'agua')).toBe(board);
  });
});

describe('bot', () => {
  it('nunca repite una casilla ya disparada', () => {
    const board = createEmptyBoard();
    const seen = new Set();

    for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
      const shot = chooseBotShot(board, 'hard', seeded(i + 1));
      expect(shot).not.toBeNull();
      const k = `${shot[0]},${shot[1]}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
      board[shot[0]][shot[1]].hit = true;
    }
    expect(chooseBotShot(board, 'hard')).toBeNull();
  });

  it('remata un barco tocado en vez de disparar al azar', () => {
    const board = createEmptyBoard();
    board[5][5] = { hasShip: true, hit: true, sunk: false };

    for (let i = 0; i < 20; i++) {
      const [r, c] = chooseBotShot(board, 'medium', seeded(i + 1));
      expect(Math.abs(r - 5) + Math.abs(c - 5)).toBe(1);
    }
  });

  it('extiende la línea cuando lleva dos impactos alineados', () => {
    const board = createEmptyBoard();
    board[5][4] = { hasShip: true, hit: true, sunk: false };
    board[5][5] = { hasShip: true, hit: true, sunk: false };

    for (let i = 0; i < 20; i++) {
      const [r, c] = chooseBotShot(board, 'hard', seeded(i + 1));
      expect(r).toBe(5);
      expect([3, 6]).toContain(c);
    }
  });

  it('deja de perseguir un barco que ya está hundido', () => {
    const board = createEmptyBoard();
    board[5][5] = { hasShip: true, hit: true, sunk: true };

    // Un único generador que avanza, para que las tiradas no estén correlacionadas
    const rnd = seeded(42);
    const shots = new Set();
    for (let i = 0; i < 40; i++) {
      const [r, c] = chooseBotShot(board, 'hard', rnd);
      shots.add(`${r},${c}`);
    }
    // Si siguiera cazando, solo saldrían las 4 casillas adyacentes
    expect(shots.size).toBeGreaterThan(4);
  });

  it('en difícil busca en patrón de damas mientras no tiene pista', () => {
    const board = createEmptyBoard();
    for (let i = 0; i < 40; i++) {
      const [r, c] = chooseBotShot(board, 'hard', seeded(i + 1));
      expect((r + c) % 2).toBe(0);
    }
  });
});

describe('modos', () => {
  it('la salva dispara tantas veces como barcos quedan', () => {
    expect(shotsFor('oneShotPerShip', 5)).toBe(5);
    expect(shotsFor('oneShotPerShip', 1)).toBe(1);
    expect(shotsFor('oneShotPerShip', 0)).toBe(1); // nunca cero disparos
  });

  it('el resto de modos tienen un número fijo de disparos', () => {
    expect(shotsFor('normal')).toBe(1);
    expect(shotsFor('rapidFire')).toBe(3);
    expect(shotsFor('hardcore')).toBe(1);
    expect(shotsFor('fogOfWar')).toBe(1);
  });

  it('hardcore pierde al fallar y niebla oculta resultados', () => {
    expect(getMode('hardcore').loseOnMiss).toBe(true);
    expect(getMode('fogOfWar').hideResults).toBe(true);
    expect(getMode('normal').loseOnMiss).toBeUndefined();
  });

  it('un modo desconocido cae en el clásico', () => {
    expect(getMode('inventado').id).toBe('normal');
  });
});

describe('utilidades', () => {
  it('fleetPayload solo manda tamaño y posiciones', () => {
    const { ships } = fixedFleet();
    const payload = fleetPayload(ships);
    expect(Object.keys(payload[0]).sort()).toEqual(['positions', 'size']);
  });

  it('cellLabel usa notación de tablero', () => {
    expect(cellLabel(0, 0)).toBe('A1');
    expect(cellLabel(9, 9)).toBe('J10');
  });
});
