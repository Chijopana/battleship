import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const fakeSocket = {
  id: 'test-socket', connected: false, auth: {}, handlers: {},
  on(e, fn) { (this.handlers[e] ||= []).push(fn); },
  off(e, fn) { this.handlers[e] = (this.handlers[e] || []).filter(h => h !== fn); },
  emit: vi.fn(), connect: vi.fn(),
};
vi.mock('socket.io-client', () => ({ io: () => fakeSocket }));

import App from './App';
import { BOARD_SIZE, SHIP_SIZES } from './game/logic';

const CELLS = BOARD_SIZE * BOARD_SIZE;
const TOTAL_SHIP_CELLS = SHIP_SIZES.reduce((a, b) => a + b, 0);

const placementBoard = () => screen.getByRole('grid', { name: /tablero de colocación/i });
const placementCells = () => within(placementBoard()).getAllByRole('gridcell');
const cellAt = (coords) =>
  within(placementBoard()).getByRole('gridcell', { name: new RegExp(`^${coords}:`) });

/** Casillas ocupadas por barcos, leídas de la etiqueta accesible. */
const occupied = () => placementCells().filter(c => /colocado/.test(c.getAttribute('aria-label')));
const shipButton = (name) => screen.getByRole('button', { name: new RegExp(name, 'i') });
const confirm = () => screen.getByRole('button', { name: /empezar partida|faltan/i });

beforeEach(() => {
  delete window.__BATTLESHIP_SOCKET__;
  fakeSocket.emit.mockClear();
  localStorage.clear();
});
afterEach(cleanup);

describe('colocación de la flota', () => {
  it('la partida empieza desplegando, no disparando', () => {
    render(<App />);
    expect(placementBoard()).toBeTruthy();
    expect(screen.queryByRole('grid', { name: /tablero enemigo/i })).toBeNull();
    expect(screen.getByText('Despliegue')).toBeTruthy();
  });

  it('viene con una flota repartida para poder empezar de un clic', () => {
    render(<App />);
    expect(occupied()).toHaveLength(TOTAL_SHIP_CELLS);
    expect(screen.getByText('5 de 5 barcos colocados')).toBeTruthy();
    expect(confirm().disabled).toBe(false);
  });

  it('vaciar deja el tablero limpio y bloquea el botón de empezar', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /vaciar/i }));

    expect(occupied()).toHaveLength(0);
    expect(screen.getByText('0 de 5 barcos colocados')).toBeTruthy();
    expect(confirm().disabled).toBe(true);
    expect(confirm().textContent).toMatch(/faltan 5 barcos/i);
  });

  it('coloca un barco donde tú quieras: eliges en el muelle y pulsas la casilla', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /vaciar/i }));

    await user.click(shipButton('portaaviones'));
    await user.click(cellAt('C4'));

    // Horizontal desde C4: C4 D4 E4 F4 G4
    ['C4', 'D4', 'E4', 'F4', 'G4'].forEach(coords => {
      expect(cellAt(coords).getAttribute('aria-label')).toMatch(/portaaviones colocado/i);
    });
    expect(cellAt('H4').getAttribute('aria-label')).toBe('H4: agua');
    expect(screen.getByText('1 de 5 barcos colocados')).toBeTruthy();
  });

  it('gira el barco antes de soltarlo', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /vaciar/i }));

    await user.click(shipButton('acorazado')); // eslora 4
    await user.click(screen.getByRole('button', { name: /girar/i }));
    await user.click(cellAt('B2'));

    // Vertical desde B2: B2 B3 B4 B5
    ['B2', 'B3', 'B4', 'B5'].forEach(coords => {
      expect(cellAt(coords).getAttribute('aria-label')).toMatch(/acorazado colocado/i);
    });
    expect(cellAt('C2').getAttribute('aria-label')).toBe('C2: agua');
  });

  it('no deja solapar dos barcos y lo explica', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /vaciar/i }));

    await user.click(shipButton('portaaviones'));
    await user.click(cellAt('A1'));           // A1..E1

    await user.click(shipButton('acorazado'));
    await user.click(cellAt('C1'));           // cruzaría el portaaviones

    expect(screen.getByText(/pisa otro barco/i)).toBeTruthy();
    expect(occupied()).toHaveLength(5);       // solo sigue el portaaviones
  });

  it('no deja que un barco se salga del tablero', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /vaciar/i }));

    await user.click(shipButton('portaaviones'));
    await user.click(cellAt('H1')); // necesitaría H, I, J y dos columnas más

    expect(screen.getByText(/se sale del tablero/i)).toBeTruthy();
    expect(occupied()).toHaveLength(0);
  });

  it('un barco ya colocado se puede levantar y mover', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /vaciar/i }));

    await user.click(shipButton('destructor')); // eslora 2
    await user.click(cellAt('A1'));
    expect(cellAt('A1').getAttribute('aria-label')).toMatch(/colocado/i);

    await user.click(cellAt('A1'));  // levantarlo
    expect(occupied()).toHaveLength(0);

    await user.click(cellAt('E5'));  // soltarlo en otro sitio
    expect(cellAt('E5').getAttribute('aria-label')).toMatch(/destructor colocado/i);
    expect(cellAt('F5').getAttribute('aria-label')).toMatch(/destructor colocado/i);
    expect(cellAt('A1').getAttribute('aria-label')).toBe('A1: agua');
  });

  it('rellenar completa solo lo que falta', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /vaciar/i }));

    await user.click(shipButton('portaaviones'));
    await user.click(cellAt('A1'));

    await user.click(screen.getByRole('button', { name: /rellenar/i }));

    expect(screen.getByText('5 de 5 barcos colocados')).toBeTruthy();
    expect(occupied()).toHaveLength(TOTAL_SHIP_CELLS);
    // El portaaviones no se ha movido
    expect(cellAt('A1').getAttribute('aria-label')).toMatch(/portaaviones colocado/i);
  });

  it('se puede colocar con el teclado', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /vaciar/i }));

    await user.click(shipButton('destructor'));
    await act(async () => { cellAt('A1').focus(); });
    await user.keyboard('{ArrowRight}{ArrowDown}{Enter}');

    expect(cellAt('B2').getAttribute('aria-label')).toMatch(/destructor colocado/i);
  });

  it('R gira el barco que llevas en mano', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /vaciar/i }));

    await user.click(shipButton('crucero')); // eslora 3
    await act(async () => { cellAt('C3').focus(); });
    await user.keyboard('r{Enter}');

    // Tras girar, vertical desde C3: C3 C4 C5
    ['C3', 'C4', 'C5'].forEach(coords => {
      expect(cellAt(coords).getAttribute('aria-label')).toMatch(/colocado/i);
    });
  });

  it('confirmar lleva la flota colocada al tablero de juego', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /vaciar/i }));

    await user.click(shipButton('portaaviones'));
    await user.click(cellAt('A1'));
    await user.click(screen.getByRole('button', { name: /rellenar/i }));
    await user.click(confirm());

    const playerBoard = screen.getByRole('grid', { name: /tu tablero/i });
    const ships = within(playerBoard).getAllByRole('gridcell')
      .filter(c => c.getAttribute('aria-label').endsWith('barco'));

    expect(ships).toHaveLength(TOTAL_SHIP_CELLS);
    // La proa del portaaviones sigue en A1, donde la puso el jugador
    expect(within(playerBoard).getByRole('gridcell', { name: 'A1: barco' })).toBeTruthy();
    expect(screen.getByText('Tuyo')).toBeTruthy();
    expect(within(screen.getByRole('grid', { name: /tablero enemigo/i }))
      .getAllByRole('gridcell').filter(c => !c.disabled)).toHaveLength(CELLS);
  });

  it('al empezar otra partida se conserva tu disposición', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /vaciar/i }));
    await user.click(shipButton('portaaviones'));
    await user.click(cellAt('A10'));
    await user.click(screen.getByRole('button', { name: /rellenar/i }));
    await user.click(confirm());

    await user.click(screen.getByRole('button', { name: /nueva partida/i }));

    // Vuelve al despliegue con la flota tal y como la dejaste
    expect(cellAt('A10').getAttribute('aria-label')).toMatch(/portaaviones colocado/i);
    expect(screen.getByText('5 de 5 barcos colocados')).toBeTruthy();
  });
});
