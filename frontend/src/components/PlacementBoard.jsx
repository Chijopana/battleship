import React, { useCallback, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import BoardGrid from './BoardGrid';
import { BOARD_SIZE, cellLabel } from '../game/logic';
import {
  canPlace,
  createRoster,
  fillRemaining,
  findSpot,
  isPlaced,
  placedCount,
  randomRoster,
  rosterComplete,
  shipAt,
  shipCells,
  withShipAt,
  withShipRemoved,
} from '../game/placement';

const clamp = (v) => Math.max(0, Math.min(BOARD_SIZE - 1, v));

/**
 * Fase de colocación: el jugador reparte su flota a mano.
 *
 * El mismo gesto sirve para ratón y para táctil: se toma un barco del muelle (o
 * se levanta uno del tablero) y se suelta en una casilla. Con teclado, las flechas
 * mueven la vista previa, R rota y Enter confirma.
 */
const PlacementBoard = ({ roster, setRoster, onConfirm, title, subtitle, confirmLabel = 'Listo' }) => {
  const [selectedId, setSelectedId] = useState(null);
  const [horizontal, setHorizontal] = useState(true);
  const [cursor, setCursor] = useState({ row: 0, col: 0 });
  const [error, setError] = useState('');
  const gridRef = useRef(null);

  const selected = roster.find(s => s.id === selectedId) ?? null;
  const complete = rosterComplete(roster);

  /** Casillas que ocuparía el barco en mano, y si la posición es válida. */
  const preview = useMemo(() => {
    if (!selected) return { cells: [], valid: false };
    const cells = shipCells(selected.size, cursor.row, cursor.col, horizontal);
    return { cells, valid: canPlace(roster, selected.id, cursor.row, cursor.col, horizontal) };
  }, [selected, roster, cursor, horizontal]);

  const previewSet = useMemo(
    () => new Set(preview.cells.map(([r, c]) => `${r},${c}`)),
    [preview.cells]
  );

  /** Toma un barco del muelle. */
  const takeShip = useCallback((ship) => {
    setError('');
    setSelectedId(prev => (prev === ship.id ? null : ship.id));
    setHorizontal(ship.horizontal);
  }, []);

  /** Levanta del tablero un barco ya colocado para volver a situarlo. */
  const liftShip = useCallback((ship, row, col) => {
    setError('');
    setRoster(withShipRemoved(roster, ship.id));
    setSelectedId(ship.id);
    setHorizontal(ship.horizontal);
    setCursor({ row, col });
  }, [roster, setRoster]);

  const dropAt = useCallback((row, col) => {
    if (!selected) return;
    if (!canPlace(roster, selected.id, row, col, horizontal)) {
      setError('Ahí no cabe: se sale del tablero o pisa otro barco.');
      return;
    }
    setRoster(withShipAt(roster, selected.id, row, col, horizontal));
    setSelectedId(null);
    setError('');
  }, [selected, roster, horizontal, setRoster]);

  const handleCellClick = useCallback((row, col) => {
    const occupant = shipAt(roster, row, col);
    if (selected) return dropAt(row, col);
    if (occupant) return liftShip(occupant, row, col);
  }, [roster, selected, dropAt, liftShip]);

  const rotate = useCallback(() => {
    setError('');
    const next = !horizontal;

    // Rotar un barco ya colocado: se queda donde está si cabe
    if (!selected) {
      const occupant = shipAt(roster, cursor.row, cursor.col);
      if (!occupant) { setHorizontal(next); return; }

      const without = withShipRemoved(roster, occupant.id);
      const [anchor] = occupant.positions;
      const spot = findSpot(without, occupant.id, anchor[0], anchor[1], next);
      if (!spot) { setError('No hay sitio para girarlo ahí.'); return; }
      setRoster(withShipAt(without, occupant.id, spot[0], spot[1], next));
      setHorizontal(next);
      return;
    }

    setHorizontal(next);
    const spot = findSpot(roster, selected.id, cursor.row, cursor.col, next);
    if (spot) setCursor({ row: spot[0], col: spot[1] });
  }, [horizontal, selected, roster, cursor, setRoster]);

  const handleKeyDown = useCallback((event) => {
    const moves = {
      ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      const row = clamp(cursor.row + move[0]);
      const col = clamp(cursor.col + move[1]);
      setCursor({ row, col });
      gridRef.current?.querySelector(`button[data-place="${row}-${col}"]`)?.focus();
      return;
    }
    if (event.key.toLowerCase() === 'r') {
      event.preventDefault();
      rotate();
    }
  }, [cursor, rotate]);

  const shuffle = useCallback(() => {
    setRoster(randomRoster());
    setSelectedId(null);
    setError('');
  }, [setRoster]);

  const fillRest = useCallback(() => {
    const filled = fillRemaining(roster);
    if (!filled) { setError('No queda hueco para el resto. Prueba con "Al azar".'); return; }
    setRoster(filled);
    setSelectedId(null);
    setError('');
  }, [roster, setRoster]);

  const clear = useCallback(() => {
    setRoster(createRoster());
    setSelectedId(null);
    setError('');
  }, [setRoster]);

  const cellClass = (row, col) => {
    const key = `${row},${col}`;
    const occupant = shipAt(roster, row, col);
    const inPreview = previewSet.has(key);

    if (inPreview) return preview.valid ? 'cell-ghost-ok' : 'cell-ghost-bad';
    if (occupant) return 'cell-ship cursor-grab';
    return 'cell-water cell-water-live';
  };

  const cellLabelFor = (row, col) => {
    const occupant = shipAt(roster, row, col);
    const where = cellLabel(row, col);
    if (occupant) return `${where}: ${occupant.name} colocado. Púlsalo para moverlo`;
    if (selected) return `${where}: colocar aquí el ${selected.name}`;
    return `${where}: agua`;
  };

  return (
    <section className="panel animate-rise-in p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-black uppercase tracking-widest text-slate-100">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>
        </div>
        <p className="text-sm font-bold tabular text-radar">
          <span className="sr-only">{placedCount(roster)} de {roster.length} barcos colocados</span>
          <span aria-hidden="true">
            {placedCount(roster)}<span className="text-slate-500">/{roster.length} colocados</span>
          </span>
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
        <div>
          <BoardGrid
            ref={gridRef}
            ariaLabel="Tablero de colocación"
            hover={cursor}
            onKeyDown={handleKeyDown}
            renderCell={(row, col) => {
              const occupant = shipAt(roster, row, col);
              const isCursor = cursor.row === row && cursor.col === col;
              return (
                <button
                  type="button"
                  role="gridcell"
                  data-place={`${row}-${col}`}
                  aria-label={cellLabelFor(row, col)}
                  title={cellLabelFor(row, col)}
                  tabIndex={isCursor ? 0 : -1}
                  className={clsx('cell', cellClass(row, col), !selected && !occupant && 'cursor-default')}
                  onClick={() => handleCellClick(row, col)}
                  onMouseEnter={() => setCursor({ row, col })}
                  onFocus={() => setCursor({ row, col })}
                />
              );
            }}
          />

          <p className="mt-3 text-center text-[0.7rem] text-slate-500">
            Elige un barco, muévete con el ratón o las flechas, pulsa <kbd className="kbd">R</kbd> para
            girarlo y confirma con clic o <kbd className="kbd">Enter</kbd>
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <h3 className="panel-heading mb-2">Muelle</h3>
            <ul className="space-y-1.5">
              {roster.map(ship => {
                const placed = isPlaced(ship);
                const active = selectedId === ship.id;
                return (
                  <li key={ship.id}>
                    <button
                      type="button"
                      onClick={() => (placed ? liftShip(ship, ...ship.positions[0]) : takeShip(ship))}
                      aria-pressed={active}
                      className={clsx(
                        'flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors',
                        active
                          ? 'border-radar bg-radar/15'
                          : placed
                            ? 'border-white/10 bg-white/[0.03] hover:border-white/25'
                            : 'border-white/15 bg-white/5 hover:border-radar/50 hover:bg-white/10'
                      )}
                    >
                      <span className={clsx(
                        'w-[4.6rem] shrink-0 text-[0.65rem] font-semibold uppercase tracking-wide',
                        placed ? 'text-slate-500' : 'text-slate-300'
                      )}>
                        {ship.name}
                      </span>
                      <span className="flex gap-[3px]" aria-hidden="true">
                        {Array.from({ length: ship.size }, (_, i) => (
                          <span
                            key={i}
                            className={clsx(
                              'h-2.5 w-2.5 rounded-[2px]',
                              active ? 'bg-radar' : placed ? 'bg-steel/40' : 'bg-steel/80'
                            )}
                          />
                        ))}
                      </span>
                      <span className="ml-auto text-[0.6rem] uppercase tracking-wide text-slate-500">
                        {active ? 'en mano' : placed ? 'a flote' : 'pendiente'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button className="btn-ghost text-xs" onClick={rotate}>
              Girar <span className="text-slate-500">(R)</span>
            </button>
            <button className="btn-ghost text-xs" onClick={shuffle}>Al azar</button>
            <button className="btn-ghost text-xs" onClick={fillRest} disabled={complete}>
              Rellenar
            </button>
            <button className="btn-ghost text-xs" onClick={clear} disabled={placedCount(roster) === 0}>
              Vaciar
            </button>
          </div>

          <button className="btn-primary w-full" onClick={onConfirm} disabled={!complete}>
            {complete ? confirmLabel : `Faltan ${roster.length - placedCount(roster)} barcos`}
          </button>

          <p role="status" aria-live="polite" className="min-h-[1.25rem] text-center text-xs text-orange-300">
            {error}
          </p>
        </div>
      </div>
    </section>
  );
};

export default PlacementBoard;
