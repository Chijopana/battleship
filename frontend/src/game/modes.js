import { TOTAL_SHIPS } from './logic';

/**
 * Configuración de los modos de juego en un solo sitio.
 * `shotsPerTurn(shipsLeft)` recibe los barcos que le quedan al rival.
 */
export const MODES = {
  normal: {
    id: 'normal',
    icon: '🎯',
    label: 'Clásico',
    hint: 'Un disparo por turno. Las reglas de toda la vida.',
    shotsPerTurn: () => 1,
  },
  oneShotPerShip: {
    id: 'oneShotPerShip',
    icon: '💣',
    label: 'Salva',
    hint: 'Disparas tantas veces como barcos te queden a flote.',
    shotsPerTurn: (shipsLeft) => Math.max(shipsLeft, 1),
  },
  rapidFire: {
    id: 'rapidFire',
    icon: '⚡',
    label: 'Fuego rápido',
    hint: 'Tres disparos por turno para los dos bandos.',
    shotsPerTurn: () => 3,
  },
  fogOfWar: {
    id: 'fogOfWar',
    icon: '🌫️',
    label: 'Niebla',
    hint: 'No sabrás si acertaste hasta el final de la partida.',
    shotsPerTurn: () => 1,
    hideResults: true,
  },
  hardcore: {
    id: 'hardcore',
    icon: '💀',
    label: 'Hardcore',
    hint: 'Un solo fallo y pierdes. Sin segundas oportunidades.',
    shotsPerTurn: () => 1,
    loseOnMiss: true,
  },
};

export const MODE_LIST = Object.values(MODES);

export const DIFFICULTIES = {
  easy: { id: 'easy', label: 'Grumete', hint: 'Dispara al azar.' },
  medium: { id: 'medium', label: 'Oficial', hint: 'Remata los barcos que te toca.' },
  hard: { id: 'hard', label: 'Almirante', hint: 'Caza en línea y peina el tablero.' },
};

export const DIFFICULTY_LIST = Object.values(DIFFICULTIES);

export const getMode = (id) => MODES[id] ?? MODES.normal;

export const shotsFor = (modeId, shipsLeft = TOTAL_SHIPS) => getMode(modeId).shotsPerTurn(shipsLeft);
