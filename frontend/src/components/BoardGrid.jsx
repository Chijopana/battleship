import React from 'react';
import clsx from 'clsx';
import { BOARD_SIZE } from '../game/logic';

const COLUMNS = Array.from({ length: BOARD_SIZE }, (_, i) => String.fromCharCode(65 + i));
const ROWS = Array.from({ length: BOARD_SIZE }, (_, i) => i);

/**
 * Rejilla 10x10 con las coordenadas A-J / 1-10 y el resaltado de fila y columna.
 * La comparten el tablero de juego y el de colocación; cada uno decide qué pinta
 * en cada casilla con `renderCell`.
 */
const BoardGrid = React.forwardRef(({
  ariaLabel,
  hover = null,
  disabled = false,
  className,
  renderCell,
  ...rest
}, ref) => (
  <div
    ref={ref}
    role="grid"
    aria-label={ariaLabel}
    aria-disabled={disabled || undefined}
    className={clsx('grid w-full select-none gap-[2px] sm:gap-[3px]', className)}
    style={{ gridTemplateColumns: `1.25rem repeat(${BOARD_SIZE}, minmax(0, 1fr))` }}
    {...rest}
  >
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

    {ROWS.map(row => (
      <div role="row" className="contents" key={row}>
        <span
          role="rowheader"
          className={clsx(
            'grid place-items-center pr-1 text-[0.6rem] font-bold tabular transition-colors sm:text-xs',
            hover?.row === row ? 'text-radar' : 'text-slate-500'
          )}
        >
          {row + 1}
        </span>
        {COLUMNS.map((_, col) => (
          <React.Fragment key={col}>{renderCell(row, col)}</React.Fragment>
        ))}
      </div>
    ))}
  </div>
));

BoardGrid.displayName = 'BoardGrid';

export default BoardGrid;
