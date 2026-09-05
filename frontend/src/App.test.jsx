import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, cleanup, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/** Socket falso: la app no debe intentar salir a la red durante los tests. */
const fakeSocket = {
  id: 'test-socket',
  connected: false,
  auth: {},
  handlers: {},
  on(event, fn) { (this.handlers[event] ||= []).push(fn); },
  off(event, fn) { this.handlers[event] = (this.handlers[event] || []).filter(h => h !== fn); },
  emit: vi.fn(),
  connect: vi.fn(),
};

vi.mock('socket.io-client', () => ({ io: () => fakeSocket }));

import App from './App';
import { BOARD_SIZE, TOTAL_SHIPS } from './game/logic';

const CELLS = BOARD_SIZE * BOARD_SIZE;

const playerBoard = () => screen.getByRole('grid', { name: /tu tablero/i });
const enemyBoard = () => screen.getByRole('grid', { name: /tablero enemigo/i });

const enemyCells = () => within(enemyBoard()).getAllByRole('gridcell');
/** Casillas enemigas todavía disparables (el tablero se bloquea fuera de tu turno). */
const targetable = () => enemyCells().filter(c => !c.disabled);
/** Casillas enemigas ya disparadas, se lea o no el resultado. */
const firedAtEnemy = () =>
  enemyCells().filter(c => !/sin disparar$/.test(c.getAttribute('aria-label')));
const hitsOnPlayer = () => within(playerBoard()).getAllByRole('gridcell')
  .filter(c => /: (agua|tocado|hundido)$/.test(c.getAttribute('aria-label')));

/** Valor de una tarjeta del marcador, buscando por su etiqueta. */
const stat = (label) => screen.getByText(label).nextElementSibling.textContent;

const myTurnAgain = () => waitFor(() => expect(stat('Turno')).toBe('Tuyo'), { timeout: 4000 });

/** La partida empieza en fase de despliegue: confirmar la flota que viene repartida. */
const deploy = (user) => user.click(screen.getByRole('button', { name: /empezar partida/i }));

/** Monta la app y entra directo a jugar. */
const play = async (user) => { render(<App />); await deploy(user); };

beforeEach(() => {
  delete window.__BATTLESHIP_SOCKET__;
  fakeSocket.emit.mockClear();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('App', () => {
  it('se monta sin errores y pinta los dos tableros completos', async () => {
    const user = userEvent.setup();
    await play(user);
    expect(screen.getAllByRole('grid')).toHaveLength(2);
    expect(within(playerBoard()).getAllByRole('gridcell')).toHaveLength(CELLS);
    expect(enemyCells()).toHaveLength(CELLS);
  });

  it('coloca la flota completa del jugador en su tablero', async () => {
    const user = userEvent.setup();
    await play(user);
    const ships = within(playerBoard()).getAllByRole('gridcell')
      .filter(c => c.getAttribute('aria-label').endsWith('barco'));
    expect(ships).toHaveLength(17); // 5 + 4 + 3 + 3 + 2
  });

  it('el tablero enemigo lleva coordenadas A-J y 1-10', async () => {
    const user = userEvent.setup();
    await play(user);
    const grid = enemyBoard();
    expect(within(grid).getByRole('columnheader', { name: 'A' })).toBeTruthy();
    expect(within(grid).getByRole('columnheader', { name: 'J' })).toBeTruthy();
    expect(within(grid).getByRole('rowheader', { name: '10' })).toBeTruthy();
  });

  it('un disparo marca la casilla, la deshabilita y anuncia el resultado', async () => {
    const user = userEvent.setup();
    await play(user);

    const cell = targetable()[0];
    const coords = cell.getAttribute('aria-label').split(':')[0];
    await user.click(cell);

    const after = within(enemyBoard()).getByRole('gridcell', { name: new RegExp(`^${coords}:`) });
    expect(after.getAttribute('aria-label')).not.toMatch(/sin disparar$/);
    expect(after.disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toMatch(/A1|agua|tocado|hundido/i);
  });

  it('bloquea el tablero enemigo mientras dispara el rival', async () => {
    const user = userEvent.setup();
    await play(user);

    await user.click(targetable()[0]);
    expect(stat('Turno')).toBe('Del rival');
    expect(targetable()).toHaveLength(0); // no se puede colar otro disparo
  });

  it('devuelve el turno al jugador cuando el rival termina', async () => {
    const user = userEvent.setup();
    await play(user);

    await user.click(targetable()[0]);
    await myTurnAgain();
    expect(targetable().length).toBe(CELLS - 1);
  });

  it('el rival dispara a tu tablero cuando le toca', async () => {
    const user = userEvent.setup();
    await play(user);

    expect(hitsOnPlayer()).toHaveLength(0);
    await user.click(targetable()[0]);
    await waitFor(() => expect(hitsOnPlayer().length).toBeGreaterThan(0), { timeout: 4000 });
  });

  it('no deja disparar dos veces la misma casilla', async () => {
    const user = userEvent.setup();
    await play(user);
    await user.click(screen.getByRole('button', { name: /fuego rápido/i }));
    await deploy(user);

    const cell = targetable()[0];
    await user.click(cell);
    await user.click(cell); // en fuego rápido sigues teniendo turno

    expect(firedAtEnemy()).toHaveLength(1);
    expect(stat('Disparos este turno')).toBe('2');
  });

  it('en fuego rápido conservas el turno durante tres disparos', async () => {
    const user = userEvent.setup();
    await play(user);
    await user.click(screen.getByRole('button', { name: /fuego rápido/i }));
    await deploy(user);

    expect(stat('Disparos este turno')).toBe('3');
    await user.click(targetable()[0]);
    expect(stat('Turno')).toBe('Tuyo');
    await user.click(targetable()[0]);
    expect(stat('Turno')).toBe('Tuyo');
    await user.click(targetable()[0]);
    expect(stat('Turno')).toBe('Del rival');
  });

  it('cambiar de modo reparte una partida nueva', async () => {
    const user = userEvent.setup();
    await play(user);

    await user.click(targetable()[0]);
    expect(firedAtEnemy()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /fuego rápido/i }));
    await deploy(user);
    expect(firedAtEnemy()).toHaveLength(0);
    expect(targetable()).toHaveLength(CELLS);
  });

  it('el modo niebla oculta el resultado de tus disparos', async () => {
    const user = userEvent.setup();
    await play(user);
    await user.click(screen.getByRole('button', { name: /niebla/i }));
    await deploy(user);
    await user.click(targetable()[0]);

    const hidden = enemyCells()
      .filter(c => /sin confirmar$/.test(c.getAttribute('aria-label')));
    expect(hidden).toHaveLength(1);
  });

  it('el botón de nueva partida limpia el tablero', async () => {
    const user = userEvent.setup();
    await play(user);

    await user.click(targetable()[0]);
    await user.click(screen.getByRole('button', { name: /nueva partida/i }));
    await deploy(user);

    expect(firedAtEnemy()).toHaveLength(0);
    expect(targetable()).toHaveLength(CELLS);
    expect(screen.getByRole('status').textContent.trim()).toBe('');
  });

  it('el marcador arranca con las dos flotas completas', async () => {
    const user = userEvent.setup();
    await play(user);
    expect(stat('Tu flota')).toBe(`${TOTAL_SHIPS}/${TOTAL_SHIPS}`);
    expect(stat('Flota enemiga')).toBe(`${TOTAL_SHIPS}/${TOTAL_SHIPS}`);
  });

  it('se puede apuntar y disparar con el teclado', async () => {
    const user = userEvent.setup();
    await play(user);

    await act(async () => { targetable()[0].focus(); });
    await user.keyboard('{ArrowRight}{ArrowDown}{Enter}');

    const fired = firedAtEnemy();
    expect(fired).toHaveLength(1);
    expect(fired[0].getAttribute('aria-label')).toMatch(/^B2:/); // una a la derecha y una abajo
  });

  it('el panel de audio se abre y se cierra con Escape', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /ajustes de sonido/i }));
    expect(screen.getByRole('dialog', { name: /sonido/i })).toBeTruthy();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: /sonido/i })).toBeNull();
  });

  it('ofrece crear sala online sin estar todavía en partida', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /crear sala/i })).toBeTruthy();
    expect(screen.getByLabelText(/código de sala/i)).toBeTruthy();
  });
});
