import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const MY_ID = 'socket-mio';
const RIVAL_ID = 'socket-rival';

/**
 * Socket falso con guion: responde a los `emit` con lo que respondería el servidor
 * y permite empujar eventos hacia el cliente para recorrer una partida entera.
 */
const socket = {
  id: MY_ID,
  connected: true,
  auth: {},
  handlers: {},
  sent: [],
  on(event, fn) { (this.handlers[event] ||= []).push(fn); },
  off(event, fn) { this.handlers[event] = (this.handlers[event] || []).filter(h => h !== fn); },
  connect() {},
  emit(event, payload, cb) {
    this.sent.push({ event, payload });
    const reply = {
      joinGame: { success: true, gameId: payload, playerId: MY_ID, sessionId: 'sess-1' },
      sendBoard: { success: true },
      playerShot: { success: true },
      requestRestart: { success: true, waiting: true },
      cancelRestart: { success: true },
      leaveGame: { success: true },
    }[event];
    cb?.(reply ?? {});
  },
  /** Empuja un evento del servidor al cliente. */
  push(event, payload) {
    (this.handlers[event] || []).forEach(fn => fn(payload));
  },
  reset() { this.sent = []; this.handlers = {}; this.auth = {}; },
};

vi.mock('socket.io-client', () => ({ io: () => socket }));

import App from './App';
import { TOTAL_SHIPS } from './game/logic';

const enemyBoard = () => screen.getByRole('grid', { name: /tablero enemigo/i });
const playerBoard = () => screen.getByRole('grid', { name: /tu tablero/i });
const cellByLabel = (board, coords) =>
  within(board).getByRole('gridcell', { name: new RegExp(`^${coords}:`) });
const stat = (label) => screen.getByText(label).nextElementSibling.textContent;
const sentEvents = (event) => socket.sent.filter(s => s.event === event);

const push = (event, payload) => act(() => { socket.push(event, payload); });

/** Entra en una sala online; queda en fase de despliegue. */
const joinRoom = async (user) => {
  await user.click(screen.getByRole('button', { name: /crear sala/i }));
  push('playerJoined', { players: [MY_ID, RIVAL_ID] });
};

/** Confirma la flota repartida, que es cuando se manda al servidor. */
const deploy = (user) => user.click(screen.getByRole('button', { name: /enviar flota/i }));

/** Entra en la sala y despliega, dejando la partida lista. */
const joinAndDeploy = async (user) => { await joinRoom(user); await deploy(user); };

beforeEach(() => {
  socket.reset();
  delete window.__BATTLESHIP_SOCKET__;
  localStorage.clear();
});

afterEach(cleanup);

describe('modo online', () => {
  it('no manda nada hasta que confirmas el despliegue', async () => {
    const user = userEvent.setup();
    render(<App />);
    await joinRoom(user);

    expect(sentEvents('sendBoard')).toHaveLength(0);
    expect(screen.getByRole('button', { name: /enviar flota/i })).toBeTruthy();

    await deploy(user);

    const [join] = sentEvents('joinGame');
    expect(join.payload).toMatch(/^[A-Z0-9]{6}$/);

    const [board] = sentEvents('sendBoard');
    expect(board.payload.gameId).toBe(join.payload);
    expect(board.payload.ships).toHaveLength(TOTAL_SHIPS);
    expect(board.payload.ships.map(s => s.size).sort()).toEqual([2, 3, 3, 4, 5]);
    // Solo tamaño y posiciones: el daño lo lleva el servidor
    expect(Object.keys(board.payload.ships[0]).sort()).toEqual(['positions', 'size']);
  });

  it('guarda el sessionId también en el auth del socket, para reconectar', async () => {
    const user = userEvent.setup();
    render(<App />);
    await joinAndDeploy(user);

    expect(localStorage.getItem('battleship_sessionId')).toBe('sess-1');
    expect(socket.auth.sessionId).toBe('sess-1');
  });

  it('espera turno hasta que el servidor lo concede', async () => {
    const user = userEvent.setup();
    render(<App />);
    await joinAndDeploy(user);

    expect(stat('Turno')).toBe('Del rival');
    expect(within(enemyBoard()).getAllByRole('gridcell').filter(c => !c.disabled)).toHaveLength(0);

    push('beginTurn', { currentPlayer: MY_ID });
    expect(stat('Turno')).toBe('Tuyo');
    expect(within(enemyBoard()).getAllByRole('gridcell').filter(c => !c.disabled)).toHaveLength(100);
  });

  it('dispara mandando solo coordenadas y pinta el resultado del servidor', async () => {
    const user = userEvent.setup();
    render(<App />);
    await joinAndDeploy(user);
    push('beginTurn', { currentPlayer: MY_ID });

    await user.click(cellByLabel(enemyBoard(), 'C3'));
    expect(sentEvents('playerShot')[0].payload).toEqual({ row: 2, col: 2 });

    push('shotFeedback', {
      row: 2, col: 2, result: 'agua', sunkShip: null, allSunk: false,
      opponentShipsRemaining: 5, myShipsRemaining: 5,
    });
    expect(cellByLabel(enemyBoard(), 'C3').getAttribute('aria-label')).toBe('C3: agua');
  });

  it('un barco hundido se pinta entero y baja el marcador rival', async () => {
    const user = userEvent.setup();
    render(<App />);
    await joinAndDeploy(user);
    push('beginTurn', { currentPlayer: MY_ID });

    push('shotFeedback', {
      row: 4, col: 6, result: 'hundido',
      sunkShip: [[4, 4], [4, 5], [4, 6]],
      allSunk: false, opponentShipsRemaining: 4, myShipsRemaining: 5,
    });

    ['E5', 'F5', 'G5'].forEach(coords => {
      expect(cellByLabel(enemyBoard(), coords).getAttribute('aria-label')).toBe(`${coords}: hundido`);
    });
    expect(stat('Flota enemiga')).toBe('4/5');
  });

  it('los disparos del rival marcan tu tablero y bajan tu marcador', async () => {
    const user = userEvent.setup();
    render(<App />);
    await joinAndDeploy(user);

    push('incomingShot', {
      row: 0, col: 0, result: 'hundido', sunkShip: [[0, 0], [0, 1]],
      allSunk: false, myShipsRemaining: 4, opponentShipsRemaining: 5,
    });

    expect(cellByLabel(playerBoard(), 'A1').getAttribute('aria-label')).toBe('A1: hundido');
    expect(stat('Tu flota')).toBe('4/5');
  });

  it('anuncia victoria cuando cae la flota rival', async () => {
    const user = userEvent.setup();
    render(<App />);
    await joinAndDeploy(user);
    push('beginTurn', { currentPlayer: MY_ID });

    push('shotFeedback', {
      row: 1, col: 1, result: 'hundido', sunkShip: [[1, 1]],
      allSunk: true, opponentShipsRemaining: 0, myShipsRemaining: 3,
    });

    expect(screen.getByText('Victoria')).toBeTruthy();
    expect(screen.getByRole('button', { name: /pedir revancha/i })).toBeTruthy();
  });

  it('anuncia derrota cuando el servidor da ganador al rival', async () => {
    const user = userEvent.setup();
    render(<App />);
    await joinAndDeploy(user);

    push('gameOver', { winner: RIVAL_ID, loser: MY_ID });
    expect(screen.getByText('Derrota')).toBeTruthy();
  });

  it('la revancha reenvía la flota: sin esto la partida reiniciada no arranca', async () => {
    const user = userEvent.setup();
    render(<App />);
    await joinAndDeploy(user);
    push('gameOver', { winner: RIVAL_ID, loser: MY_ID });

    const boardsBefore = sentEvents('sendBoard').length;

    await user.click(screen.getByRole('button', { name: /pedir revancha/i }));
    expect(sentEvents('requestRestart')).toHaveLength(1);
    expect(screen.getByText(/esperando respuesta del rival/i)).toBeTruthy();

    push('gameRestarted', {});

    // El servidor vacía las flotas al reiniciar; si el cliente no reenvía la suya,
    // nunca se emite beginTurn y la revancha se queda colgada.
    expect(screen.queryByText('Derrota')).toBeNull();
    await deploy(user);
    expect(sentEvents('sendBoard')).toHaveLength(boardsBefore + 1);
    expect(stat('Tu flota')).toBe('5/5');
  });

  it('avisa cuando el rival pide revancha', async () => {
    const user = userEvent.setup();
    render(<App />);
    await joinAndDeploy(user);
    push('gameOver', { winner: RIVAL_ID, loser: MY_ID });

    push('opponentRequestsRestart', {});
    expect(screen.getByText(/el rival quiere la revancha/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /aceptar revancha/i })).toBeTruthy();
  });

  it('muestra la cuenta atrás si el rival se desconecta', async () => {
    const user = userEvent.setup();
    render(<App />);
    await joinAndDeploy(user);

    push('opponentDisconnected', { grace: 60 });
    expect(screen.getByText(/60s para que vuelva/i)).toBeTruthy();

    push('opponentReconnected', {});
    expect(screen.queryByText(/para que vuelva/i)).toBeNull();
  });

  it('salir de la sala vuelve al modo local con partida limpia', async () => {
    const user = userEvent.setup();
    render(<App />);
    await joinAndDeploy(user);

    await user.click(screen.getByRole('button', { name: /^salir$/i }));

    expect(sentEvents('leaveGame')).toHaveLength(1);
    expect(localStorage.getItem('battleship_sessionId')).toBeNull();
    expect(screen.getByRole('button', { name: /crear sala/i })).toBeTruthy();
    expect(stat('Turno')).toBe('Despliegue'); // vuelta al modo local, listo para colocar
  });

  it('un error del servidor se muestra y devuelve el turno', async () => {
    const user = userEvent.setup();
    render(<App />);
    await joinAndDeploy(user);
    push('beginTurn', { currentPlayer: MY_ID });

    const original = socket.emit;
    socket.emit = function (event, payload, cb) {
      if (event === 'playerShot') { this.sent.push({ event, payload }); return cb?.({ error: 'No es tu turno' }); }
      return original.call(this, event, payload, cb);
    };

    await user.click(cellByLabel(enemyBoard(), 'A1'));
    expect(screen.getByRole('status').textContent).toMatch(/No es tu turno/);
    expect(stat('Turno')).toBe('Tuyo');

    socket.emit = original;
  });
});
