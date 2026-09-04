import React, { useCallback, useRef, useState } from 'react';
import clsx from 'clsx';
import Cell from './Cell';
import { BOARD_SIZE } from '../game/logic';

const COLUMNS = Array.from({ length: BOARD_SIZE }, (_, i) => String.fromCharCode(65 + i));
const clamp = (v) => Math.max(0, Math.min(BOARD_SIZE - 1, v));

/**
 * Tablero de 10x10 con coordenadas A-J / 1-10.
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
    <div
      ref={gridRef}
      role="grid"
      aria-label={isPlayer ? 'Tu tablero' : 'Tablero enemigo'}
      aria-disabled={disabled || undefined}
      onKeyDown={handleKeyDown}
      onMouseLeave={() => setHover(null)}
      className={clsx(
        'grid w-full select-none gap-[2px] sm:gap-[3px]',
        disabled && !isPlayer && 'board-locked'
      )}
      style={{ gridTemplateColumns: `1.25rem repeat(${BOARD_SIZE}, minmax(0, 1fr))` }}
    >
      {/* Cabecera con las letras de columna */}
      <div role="row" className="contents">
        <span aria-hidden="true" />
        {COLUMNS.map((letter, col) => (
          <span
            key={letter}
            role="columnheader"
            className={clsx(
              'pb-1 text-center text-[0.6rem] font-bold tracking-wider transition-colors sm:text-xs',
              hover?.col === col ? 'text-radar' : 'text-slate-500'
            )}
          >
            {letter}
          </span>
        ))}
      </div>

      {grid.map((row, rowIndex) => (
        <div role="row" className="contents" key={rowIndex}>
          <span
            role="rowheader"
            className={clsx(
              'grid place-items-center pr-1 text-[0.6rem] font-bold tabular transition-colors sm:text-xs',
              hover?.row === rowIndex ? 'text-radar' : 'text-slate-500'
            )}
          >
            {rowIndex + 1}
          </span>

          {row.map((cell, colIndex) => (
            <Cell
              key={colIndex}
              cell={cell}
              row={rowIndex}
              col={colIndex}
              isPlayer={isPlayer}
              hideResults={hideResults}
              revealAll={revealAll}
              disabled={disabled}
              isLast={lastShot?.row === rowIndex && lastShot?.col === colIndex}
              isCrosshair={!isPlayer && (hover?.row === rowIndex || hover?.col === colIndex)}
              focusable={cursor.row === rowIndex && cursor.col === colIndex}
              onFire={onFire}
              onHover={handleHover}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

export default Board;
