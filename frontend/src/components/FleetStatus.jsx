import React from 'react';
import clsx from 'clsx';
import { SHIP_CLASSES } from '../game/logic';

/**
 * Estado de una flota. Acepta la lista real de barcos (modo local, sabemos
 * cuál cayó) o solo el número de supervivientes (modo online, el servidor
 * no revela qué barco concreto se hundió).
 */
const FleetStatus = ({ title, ships = null, remaining = null, tone = 'radar' }) => {
  const classes = [...SHIP_CLASSES].sort((a, b) => b.size - a.size);
  const list = ships
    ? [...ships].sort((a, b) => b.size - a.size)
    : classes.map((ship, i) => ({ ...ship, sunk: i >= (remaining ?? classes.length) }));

  const alive = list.filter(s => !s.sunk).length;
  const accent = tone === 'sunk' ? 'text-sunk' : 'text-radar';

  return (
    <div className="panel p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="panel-heading">{title}</span>
        <span className={clsx('text-sm font-bold tabular', accent)}>
          {alive}<span className="text-slate-500">/{list.length}</span>
        </span>
      </div>

      <ul className="space-y-1.5">
        {list.map((ship, i) => (
          <li key={i} className="flex items-center gap-2">
            <span
              className={clsx(
                'w-[4.6rem] shrink-0 text-[0.65rem] font-semibold uppercase tracking-wide',
                ship.sunk ? 'text-slate-600 line-through' : 'text-slate-400'
              )}
            >
              {ship.name ?? `Barco ${ship.size}`}
            </span>

            <span className="flex gap-[3px]" aria-hidden="true">
              {Array.from({ length: ship.size }, (_, j) => (
                <span
                  key={j}
                  className={clsx(
                    'h-2 w-2 rounded-[2px] transition-colors sm:h-2.5 sm:w-2.5',
                    ship.sunk ? 'bg-sunk/70' : 'bg-steel/60'
                  )}
                />
              ))}
            </span>

            <span className="sr-only">{ship.sunk ? 'hundido' : 'a flote'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default FleetStatus;
