import React from 'react'; 

const Cell = ({ cell, onClick, isPlayer }) => {
  const cellClass = cell.hit
    ? cell.hasShip
      ? "bg-red-500" 
      : "bg-blue-500" 
    : "bg-gray-200"; 

  return (
    <div
      onClick={onClick}
      className={`w-10 h-10 cursor-pointer border ${cellClass}`}
    ></div>
  );
};

export default Cell;
