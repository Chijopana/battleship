// Cell.js
import React from 'react';

const Cell = ({ cell, onClick, isPlayer }) => {
  let cellStyle = '';

  // Si es el tablero del jugador
  if (isPlayer) {
    if (cell.hasShip) {
      // Barcos visibles en gris cuando no son tocados
      cellStyle = cell.hit ? 'bg-red-500' : 'bg-gray-400'; // Barcos en gris
    } else {
      // Agua, se pone azul si no ha sido tocado
      cellStyle = cell.hit ? 'bg-blue-500' : 'bg-blue-300'; // Agua azul
    }
  } else {
    // Si es el tablero del enemigo (bot)
    if (cell.hit) {
      if (cell.hasShip) {
        // Rojo si el bot tocó un barco
        cellStyle = 'bg-red-500';
      } else {
        // Azul claro si el bot falló (agua)
        cellStyle = 'bg-blue-500';
      }
    } else {
      // Casillas no tocadas (gris por defecto)
      cellStyle = 'bg-blue-300'; // Gris para las casillas no tocadas
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
