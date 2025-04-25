import React from 'react';
import Cell from './Cell';

const Board = ({ grid, onCellClick, isPlayer }) => {
  return (
    <div
      className="grid grid-cols-10 gap-[2px] p-2 rounded-lg shadow-md border-4 border-blue-900 bg-blue-200"
    >
      {grid.map((row, rowIndex) =>
        row.map((cell, colIndex) => (
          <Cell
            key={`${rowIndex}-${colIndex}`}
            cell={cell}
            onClick={() =>
              !isPlayer && onCellClick
                ? onCellClick(rowIndex, colIndex)
                : null
            }
            isPlayer={isPlayer}
          />
        ))
      )}
    </div>
  );
};

export default Board;
