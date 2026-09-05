import React, { useCallback, useRef, useState } from 'react';
import BoardGrid from './BoardGrid';
import Cell from './Cell';
import { BOARD_SIZE } from '../game/logic';

const clamp = (v) => Math.max(0, Math.min(BOARD_SIZE - 1, v));

/**
 * Tablero de juego.
 *
 * El tablero enemigo se puede jugar con el teclado: las flechas mueven la mira
 * y Enter o Espacio disparan (tabindex móvil, un solo tab-stop para todo el tablero).
 */
const Board = ({
  grid,
  isPlayer = false,
  disabled = false,
  hideResults = false,
  revealAll = false,
  lastShot = null,
  onFire,
}) => {
  const gridRef = useRef(null);
  const [cursor, setCursor] = useState({ row: 0, col: 0 });
  const [hover, setHover] = useState(null);

  const focusCell = useCallback((row, col) => {
    setCursor({ row, col });
    gridRef.current?.querySelector(`button[data-cell="${row}-${col}"]`)?.focus();
  }, []);

  const handleKeyDown = useCallback((event) => {
    if (isPlayer || disabled) return;
    const moves = {
      ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      focusCell(clamp(cursor.row + move[0]), clamp(cursor.col + move[1]));
      return;
    }
    if (event.key === 'Home') { event.preventDefault(); focusCell(cursor.row, 0); }
    if (event.key === 'End') { event.preventDefault(); focusCell(cursor.row, BOARD_SIZE - 1); }
  }, [cursor, disabled, focusCell, isPlayer]);

  const handleHover = useCallback((row, col) => setHover({ row, col }), []);

  if (!Array.isArray(grid) || grid.length === 0) return null;

  return (
    <BoardGrid
      ref={gridRef}
      ariaLabel={isPlayer ? 'Tu tablero' : 'Tablero enemigo'}
      hover={hover}
      disabled={disabled}
      className={disabled && !isPlayer ? 'board-locked' : undefined}
      onKeyDown={handleKeyDown}
      onMouseLeave={() => setHover(null)}
      renderCell={(row, col) => (
        <Cell
          cell={grid[row][col]}
          row={row}
          col={col}
          isPlayer={isPlayer}
          hideResults={hideResults}
          revealAll={revealAll}
          disabled={disabled}
          isLast={lastShot?.row === row && lastShot?.col === col}
          isCrosshair={!isPlayer && (hover?.row === row || hover?.col === col)}
          focusable={cursor.row === row && cursor.col === col}
          onFire={onFire}
          onHover={handleHover}
        />
      )}
    />
  );
};

export default Board;
