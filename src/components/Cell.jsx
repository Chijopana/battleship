import React from 'react';

const Cell = ({ cell, onClick, isPlayer }) => {
  let cellStyle = '';


  if (isPlayer) {
    if (cell.hasShip) {

      cellStyle = cell.hit ? 'bg-red-500' : 'bg-gray-400'; 
    } else {

      cellStyle = cell.hit ? 'bg-blue-500' : 'bg-blue-300'; 
    }
  } else {
    if (cell.hit) {
      if (cell.hasShip) {
 
        cellStyle = 'bg-red-500';
      } else {
  
        cellStyle = 'bg-blue-500';
      }
    } else {

      cellStyle = 'bg-blue-300'; 
    }
  }

  return (
    <div
      className={`w-10 h-10 border-2 cursor-pointer ${cellStyle}`}
      onClick={onClick}
    />
  );
};

export default Cell;
