import React from 'react';
import clsx from 'clsx';
import { cellLabel } from '../game/logic';

/**
 * Deriva el estado visual de una casilla.
 * Unifica el modelo local (hasShip/hit/sunk) y el online (result del servidor).
 */
export const cellState = (cell = {}, { isPlayer, hideResults = false, revealAll = false } = {}) => {
  const { hasShip, hit, sunk, result } = cell;

  if (isPlayer) {
    // En online `result` viene del servidor y manda sobre el estado local
    if (result === 'hundido' || (hasShip && sunk)) return 'sunk';
    if (result === 'tocado' || (hasShip && hit)) return 'hit';
    if (hasShip) return 'ship';
    if (hit) return 'miss';
    return 'water';
  }

  if (!hit) return revealAll && hasShip ? 'ship' : 'water';
  if (hideResults && !revealAll) return 'hidden';

  const outcome = result ?? (sunk ? 'hundido' : hasShip ? 'tocado' : 'agua');
  if (outcome === 'hundido') return 'sunk';
  if (outcome === 'tocado') return 'hit';
  return 'miss';
};

const STATE_CLASS = {
  water: 'cell-water',
  hidden: 'cell-hidden',
  miss: 'cell-miss',
  hit: 'cell-hit',
  sunk: 'cell-sunk',
  ship: 'cell-ship',
};

const STATE_LABEL = {
  water: 'sin disparar',
  hidden: 'disparo sin confirmar',
  miss: 'agua',
  hit: 'tocado',
  sunk: 'hundido',
  ship: 'barco',
};

const Marker = ({ state }) => {
  switch (state) {
    case 'miss':
      return <span className="block h-1.5 w-1.5 rounded-full bg-slate-300/70 sm:h-2 sm:w-2" />;
    case 'hit':
      return (
        <svg viewBox="0 0 16 16" className="h-3 w-3 text-white sm:h-3.5 sm:w-3.5" aria-hidden="true">
          <path fill="currentColor" d="M8 0l1.9 4.4L14.5 3l-2 4.4 3.5 2.2-4.8.6L12 15l-4-2.8L4 15l.8-4.8-4.8-.6 3.5-2.2-2-4.4 4.6 1.4z" />
        </svg>
      );
    case 'sunk':
      return (
        <svg viewBox="0 0 16 16" className="h-3 w-3 text-rose-100 sm:h-3.5 sm:w-3.5" aria-hidden="true">
          <path stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" d="M3 3l10 10M13 3L3 13" />
        </svg>
      );
    case 'hidden':
      return <span className="text-[0.55rem] font-bold text-slate-400 sm:text-[0.65rem]">?</span>;
    default:
      return null;
  }
};

/**
 * Una casilla del tablero. No decide nada del juego: solo pinta y avisa del click.
 */
const Cell = ({
  cell,
  row,
  col,
  isPlayer = false,
  hideResults = false,
  revealAll = false,
  disabled = false,
  isLast = false,
  isCrosshair = false,
  focusable = false,
  onFire,
  onHover,
}) => {
  const state = cellState(cell, { isPlayer, hideResults, revealAll });
  const isTargetable = !isPlayer && !disabled && state === 'water';

  const label = `${cellLabel(row, col)}: ${STATE_LABEL[state]}`;
  const commonClass = clsx(
    'cell',
    STATE_CLASS[state],
    isTargetable && 'cell-water-live cursor-crosshair',
    isTargetable && isCrosshair && 'cell-crosshair',
    isLast && 'cell-last',
    (state === 'hit' || state === 'sunk') && 'animate-blast'
  );

  if (isPlayer) {
    // El tablero propio es informativo: no debe capturar foco ni clicks
    return (
      <div className={commonClass} role="gridcell" aria-label={label} title={label}>
        <Marker state={state} />
      </div>
    );
  }

  return (
    <button
      type="button"
      role="gridcell"
      data-cell={`${row}-${col}`}
      className={commonClass}
      aria-label={label}
      title={label}
      disabled={disabled || state !== 'water'}
      tabIndex={focusable ? 0 : -1}
      onClick={() => onFire?.(row, col)}
      onMouseEnter={() => onHover?.(row, col)}
      onFocus={() => onHover?.(row, col)}
    >
      <Marker state={state} />
    </button>
  );
};

export default React.memo(Cell);
