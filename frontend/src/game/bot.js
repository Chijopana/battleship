/**
 * IA del rival. Juega solo con la información que un jugador humano tendría:
 * qué casillas ha disparado y qué le respondieron (agua / tocado / hundido).
 * No mira dónde están los barcos que aún no ha tocado.
 */
import { BOARD_SIZE, inBounds } from './logic';

const key = ([r, c]) => `${r},${c}`;

const availableCells = (board) => {
  const cells = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (!board[r][c].hit) cells.push([r, c]);
    }
  }
  return cells;
};

/** Casillas tocadas de barcos que todavía no se han hundido. */
const activeHits = (board) => {
  const cells = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = board[r][c];
      if (cell.hit && cell.hasShip && !cell.sunk) cells.push([r, c]);
    }
  }
  return cells;
};

const pick = (list, random) => list[Math.floor(random() * list.length)];

/**
 * Modo "caza": persigue un barco ya tocado.
 * Con dos o más impactos alineados, extiende la línea por sus extremos —
 * que es exactamente lo que haría una persona.
 */
const targetShot = (board, hits) => {
  if (hits.length === 0) return [];

  if (hits.length >= 2) {
    const rows = new Set(hits.map(([r]) => r));
    const cols = new Set(hits.map(([, c]) => c));

    if (rows.size === 1 || cols.size === 1) {
      const horizontal = rows.size === 1;
      const axis = hits.map(([r, c]) => (horizontal ? c : r)).sort((a, b) => a - b);
      const fixed = horizontal ? hits[0][0] : hits[0][1];
      const ends = [axis[0] - 1, axis[axis.length - 1] + 1];

      const candidates = ends
        .map(v => (horizontal ? [fixed, v] : [v, fixed]))
        .filter(([r, c]) => inBounds(r, c) && !board[r][c].hit);

      if (candidates.length) return candidates;
    }
  }

  // Un solo impacto (o impactos sueltos): probar las cuatro casillas adyacentes
  const seen = new Set();
  const neighbours = [];
  for (const [r, c] of hits) {
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cell = [r + dr, c + dc];
      if (!inBounds(cell[0], cell[1])) continue;
      if (board[cell[0]][cell[1]].hit) continue;
      if (seen.has(key(cell))) continue;
      seen.add(key(cell));
      neighbours.push(cell);
    }
  }
  return neighbours;
};

/**
 * Modo "búsqueda" en tablero de damas: el barco más pequeño mide 2,
 * así que basta con explorar una casilla de cada dos para no dejar hueco.
 */
const parityCells = (cells) => {
  const parity = cells.filter(([r, c]) => (r + c) % 2 === 0);
  return parity.length ? parity : cells;
};

/**
 * Elige la siguiente casilla del bot.
 * @returns {[number, number] | null} null si ya no quedan casillas.
 */
export const chooseBotShot = (board, difficulty = 'easy', random = Math.random) => {
  const available = availableCells(board);
  if (available.length === 0) return null;

  if (difficulty === 'easy') return pick(available, random);

  const hunting = targetShot(board, activeHits(board));
  if (hunting.length) return pick(hunting, random);

  if (difficulty === 'hard') return pick(parityCells(available), random);
  return pick(available, random);
};
