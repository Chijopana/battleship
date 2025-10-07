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

  const handleCellClick = (row, col, cell) => {
    if (disabled || isPlayer) return;
    if (onCellClick && !cell.hit) onCellClick(row, col);
  };

  const getCellColor = (cell) => {
    const { hit, hasShip, shipSunk, type } = cell;

    if (isPlayer) {
      if (hasShip && hit) return 'bg-red-600';
      if (hasShip) return 'bg-gray-600';
      if (hit && !hasShip) return 'bg-white';
      return 'bg-blue-200';
    }

    if (type) {
      switch (type) {
        case 'agua': return 'bg-white';
        case 'tocado': return 'bg-red-600 animate-pulse';
        case 'hundido': return 'bg-red-700 animate-bounce';
        default: return 'bg-gray-400';
      }
    }

    if (mode === 'fogOfWar') {
      if (!hit) return 'bg-blue-200 hover:bg-blue-300 focus:bg-blue-300';
      if (shipSunk) return 'bg-red-600';
      return 'bg-gray-400';
    }

    if (hit && hasShip) return shipSunk ? 'bg-red-700' : 'bg-red-600';
    if (hit && !hasShip) return 'bg-white';
    return 'bg-blue-200 hover:bg-blue-300 focus:bg-blue-300';
  };

  return (
    <div
      role="grid"
      aria-label={isPlayer ? "Tablero del jugador" : "Tablero del enemigo"}
      className={clsx(
        'grid grid-cols-10 gap-1 p-2 rounded-lg border-2',
        isPlayer ? 'border-gray-500 bg-blue-50' : 'border-gray-700 bg-blue-100'
      )}
    >
      {grid.map((row, rowIndex) =>
        row.map((cell, colIndex) => {
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
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') handleCellClick(rowIndex, colIndex, cell);
              }}
              title={tooltipText}
              className={clsx(
                'w-7 h-7 sm:w-10 sm:h-10 border rounded cursor-pointer transition-colors duration-200',
                cellColor,
                disabled && !isPlayer ? 'cursor-not-allowed opacity-50' : '',
                'focus:outline-none focus:ring-2 focus:ring-yellow-400'
              )}
            />
          );
        })
      )}
    </div>
  );
};

export default Board;
