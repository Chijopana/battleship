import React from 'react';
import clsx from 'clsx';

const Cell = ({ cell, onClick, isPlayer, mode }) => {
  const getCellStyle = () => {
    if (isPlayer) {
      if (cell.hasShip && cell.hit) return 'bg-red-500';        // Barco tocado
      if (cell.hasShip) return 'bg-blue-700';                   // Barco visible
      if (cell.hit) return 'bg-gray-400';                       // Agua
      return 'bg-blue-200';
    } else {
      if (mode === 'hard') {
        // En modo difícil no se muestra nada más que la cuadrícula
        return 'bg-blue-200';
      }
      if (cell.hit && cell.hasShip) return 'bg-red-500';
      if (cell.hit && !cell.hasShip) return 'bg-gray-400';
      return 'bg-blue-200';
    }
  };

  return (
    <div
      onClick={onClick}
      className={`w-8 h-8 border border-white cursor-pointer ${getCellStyle()}`}
    ></div>
  );
};

const Board = ({ grid, isPlayer, onCellClick, mode }) => {
  return (
    <div className="grid grid-cols-10 gap-1">
      {grid.map((row, rowIndex) =>
        row.map((cell, colIndex) => {
          const isHit = cell.hit;
          const hasShip = cell.hasShip;
          const key = `${rowIndex}-${colIndex}`;

          const handleClick = () => {
            if (onCellClick && !cell.hit) {
              onCellClick(rowIndex, colIndex);
            }
          };

          const baseStyle = 'w-8 h-8 sm:w-10 sm:h-10 border rounded cursor-pointer transition-colors duration-200';

          let cellColor = 'bg-blue-200 hover:bg-blue-300';

          if (isPlayer) {
            if (hasShip) cellColor = 'bg-gray-600';
            if (isHit && hasShip) cellColor = 'bg-red-600';
            if (isHit && !hasShip) cellColor = 'bg-white';
          } else {
            if (mode === 'hard') {
              // En modo difícil, solo mostrar si fue clicado (sin importar si fue acierto)
              if (isHit) cellColor = 'bg-gray-400';
            } else {
              if (isHit && hasShip) cellColor = 'bg-red-600';
              if (isHit && !hasShip) cellColor = 'bg-white';
            }
          }

          return (
            <div
              key={key}
              onClick={handleClick}
              className={clsx(baseStyle, cellColor)}
            />
          );
        })
      )}
    </div>
  );
};

export default Board;
