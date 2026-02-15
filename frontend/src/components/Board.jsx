import React, { useMemo } from 'react';
import clsx from 'clsx';

/**
 * Componente Board
 * Representa el tablero de Battleship para jugador u oponente.
 *
 * Props:
 * - grid: Matriz de celdas [{ hasShip, hit, shipSunk?, type? }]
 * - isPlayer: bool → si es el tablero del jugador
 * - onCellClick: función(row, col) para manejar disparos en tablero enemigo
 * - mode: string → 'normal' | 'fogOfWar'
 * - disabled: bool → desactiva clicks
 */
const Board = ({ grid, isPlayer, onCellClick, mode = 'normal', disabled = false }) => {
  if (!grid || !Array.isArray(grid)) return null;

  const [lastHitCell, setLastHitCell] = React.useState(null);

  const handleCellClick = (row, col, cell) => {
    if (disabled || isPlayer) return;
    if (cell.hit) return;
    setLastHitCell(`${row}-${col}`);
    setTimeout(() => setLastHitCell(null), 600);
    if (onCellClick) onCellClick(row, col);
  };

  const handleCellTouchStart = (e) => {
    // Prevenir zoom en touch
    if (e.touches.length > 1) e.preventDefault();
  };

  const getCellColor = (cell) => {
    const { hit, hasShip, shipSunk, type } = cell;

    if (isPlayer) {
      if (hasShip && hit) return shipSunk ? 'bg-red-700 animate-impact' : 'bg-red-600 animate-pulse';
      if (hasShip) return 'bg-gray-600';
      if (hit && !hasShip) return 'bg-blue-300';
      return 'bg-blue-200';
    }

    if (type) {
      switch (type) {
        case 'agua': return 'bg-blue-300';
        case 'tocado': return 'bg-orange-500 animate-pulse';
        case 'hundido': return 'bg-red-700 animate-impact';
        default: return 'bg-gray-400';
      }
    }

    // Fog of war: oculta TODO excepto los disparos realizados
    if (mode === 'fogOfWar') {
      if (!hit) return 'bg-blue-200 hover:bg-blue-300 focus:bg-blue-300';
      return 'bg-gray-400';
    }

    if (hit && hasShip) return shipSunk ? 'bg-red-700 animate-impact' : 'bg-orange-500 animate-pulse';
    if (hit && !hasShip) return 'bg-blue-300';
    return 'bg-blue-200 hover:bg-blue-300 focus:bg-blue-300';
  };

  return (
    <div
      role="grid"
      aria-label={isPlayer ? "Tablero del jugador" : "Tablero del enemigo"}
      className={clsx(
        'grid grid-cols-10 gap-0.5 sm:gap-1 p-2 rounded-lg border-2 water-effect transition-all duration-300',
        isPlayer ? 'border-gray-500 bg-gradient-to-b from-blue-100 to-blue-200 shadow-md' : 'border-purple-600 bg-gradient-to-b from-blue-200 to-blue-300 shadow-xl'
      )}
    >
      {grid.map((row, rowIndex) =>
        row.map((cell, colIndex) => {
          const cellKey = `${rowIndex}-${colIndex}`;
          const isAnimating = lastHitCell === cellKey;
          const cellColor = useMemo(() => getCellColor(cell), [cell, mode, isPlayer]);
          const tooltipText = isPlayer
            ? cell.hasShip
              ? cell.hit ? "Barco tocado" : "Barco intacto"
              : cell.hit ? "Agua" : "Vacío"
            : cell.hit
              ? cell.type === 'agua' ? "Agua" : cell.type === 'tocado' ? "Tocado" : "Hundido"
              : "Sin disparar";

          return (
            <div
              key={`${rowIndex}-${colIndex}`}
              role="gridcell"
              aria-label={tooltipText}
              tabIndex={disabled ? -1 : 0}
              onClick={() => handleCellClick(rowIndex, colIndex, cell)}
              onTouchStart={handleCellTouchStart}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleCellClick(rowIndex, colIndex, cell);
                }
              }}
              title={tooltipText}
              className={clsx(
                'w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 border-2 rounded cursor-pointer transition-all duration-150 select-none',
                cellColor,
                isAnimating && 'animate-explosion shadow-xl ring-2 ring-yellow-400',
                disabled && !isPlayer ? 'cursor-not-allowed opacity-50' : '',
                !isPlayer && !cell.hit && !disabled ? 'hover:scale-125 active:scale-90 hover:shadow-lg hover:border-yellow-300' : '',
                'focus:outline-none focus:ring-2 focus:ring-yellow-400 border-opacity-70'
              )}
            />
          );
        })
      )}
    </div>
  );
};

export default Board;
