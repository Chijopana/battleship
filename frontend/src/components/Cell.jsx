import React, { useMemo } from 'react';
import clsx from 'clsx';
// import { motion } from 'framer-motion'; // para animaciones si quieres

/**
 * Cell
 * Representa una sola celda del tablero.
 *
 * Props:
 * - cell: { hasShip, hit, shipSunk?, type? }
 * - isPlayer: bool → si pertenece al tablero del jugador
 * - disabled: bool → desactiva clics (modo online cuando no es tu turno)
 * - onClick: función → se llama cuando haces click (solo enemigo)
 */
const Cell = ({ cell = {}, isPlayer = false, disabled = false, onClick }) => {
  const { hasShip, hit, shipSunk, type } = cell;

  const handleClick = () => {
    if (disabled || isPlayer || hit) return;
    if (onClick) onClick();
  };

  const getCellColor = useMemo(() => {
    if (isPlayer) {
      if (hasShip && hit) return 'bg-red-600';
      if (hasShip) return 'bg-gray-600';
      if (hit && !hasShip) return 'bg-white';
      return 'bg-blue-200';
    }

    // Tablero enemigo
    if (type) {
      switch (type) {
        case 'agua': return 'bg-white';
        case 'tocado': return 'bg-red-600 animate-pulse';
        case 'hundido': return 'bg-red-700 animate-bounce';
        default: return 'bg-gray-400';
      }
    }

    // Local (modo normal/fogOfWar)
    if (hit && hasShip) return shipSunk ? 'bg-red-700' : 'bg-red-600';
    if (hit && !hasShip) return 'bg-white';
    return 'bg-blue-200 hover:bg-blue-300 focus:bg-blue-300';
  }, [cell, isPlayer, type, hit, shipSunk, hasShip]);

  const tooltipText = isPlayer
    ? hasShip
      ? hit ? "Barco tocado" : "Barco intacto"
      : hit ? "Agua" : "Vacío"
    : hit
      ? type === 'agua' ? "Agua" : type === 'tocado' ? "Tocado" : "Hundido"
      : "Sin disparar";

  return (
    <div
      role="gridcell"
      aria-label={tooltipText}
      tabIndex={disabled ? -1 : 0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleClick();
      }}
      title={tooltipText}
      className={clsx(
        'w-7 h-7 sm:w-10 sm:h-10 border rounded cursor-pointer transition-colors duration-200',
        getCellColor,
        disabled && !isPlayer ? 'cursor-not-allowed opacity-50' : '',
        'focus:outline-none focus:ring-2 focus:ring-yellow-400'
      )}
    />
  );
};

export default Cell;
