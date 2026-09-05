import { vi } from 'vitest';

/**
 * jsdom no implementa Web Audio. Un doble mínimo basta: la app solo necesita
 * que las llamadas no revienten, el sonido en sí no se testea.
 */
class FakeParam {
  constructor() { this.value = 0; }
  setValueAtTime() { return this; }
  exponentialRampToValueAtTime() { return this; }
}

class FakeAudioContext {
  constructor() {
    this.sampleRate = 44100;
    this.currentTime = 0;
    this.state = 'running';
    this.destination = {};
  }
  createOscillator() {
    return { frequency: new FakeParam(), type: 'sine', connect() {}, start() {}, stop() {} };
  }
  createGain() { return { gain: new FakeParam(), connect() {} }; }
  createBiquadFilter() { return { type: '', frequency: new FakeParam(), connect() {} }; }
  createBuffer(channels, length) {
    return { getChannelData: () => new Float32Array(length) };
  }
  createBufferSource() { return { buffer: null, connect() {}, start() {} }; }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
}

window.AudioContext = FakeAudioContext;
window.webkitAudioContext = FakeAudioContext;

// matchMedia lo usan utilidades de accesibilidad; jsdom no lo trae
if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
}

// Los diálogos nativos bloquearían el test
window.confirm = vi.fn(() => true);
window.alert = vi.fn();
