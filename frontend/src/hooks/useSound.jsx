import { useRef, useCallback, useState, useEffect } from 'react';

const STORAGE_KEY = 'battleship_audio';

const readStored = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      muted: Boolean(parsed.muted),
      volume: Math.min(Math.max(Number(parsed.volume) || 0, 0), 1),
    };
  } catch {
    return null;
  }
};

/**
 * Efectos de sonido sintetizados con la Web Audio API (sin archivos que cargar).
 * Recuerda volumen y silencio entre sesiones.
 */
const useSound = () => {
  const stored = readStored();
  const audioContextRef = useRef(null);
  const [isMuted, setIsMuted] = useState(stored?.muted ?? false);
  const [volume, setVolume] = useState(stored?.volume ?? 0.5);

  // Refs para que los callbacks no se recreen en cada cambio de volumen
  const mutedRef = useRef(isMuted);
  const volumeRef = useRef(volume);
  mutedRef.current = isMuted;
  volumeRef.current = volume;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ muted: isMuted, volume }));
    } catch { /* modo privado o almacenamiento lleno: no es crítico */ }
  }, [isMuted, volume]);

  // Las melodías de victoria y derrota se encadenan con setTimeout: si el
  // componente se desmonta a medias, esos temporizadores seguían disparando
  // sobre un AudioContext ya cerrado.
  const timersRef = useRef([]);
  const disposedRef = useRef(false);

  const later = useCallback((fn, ms) => {
    const id = setTimeout(() => {
      timersRef.current = timersRef.current.filter(t => t !== id);
      if (!disposedRef.current) fn();
    }, ms);
    timersRef.current.push(id);
  }, []);

  useEffect(() => () => {
    disposedRef.current = true;
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    audioContextRef.current?.close?.();
    audioContextRef.current = null;
  }, []);

  const getAudioContext = useCallback(() => {
    if (disposedRef.current) return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    if (!audioContextRef.current) audioContextRef.current = new AudioCtx();
    const ctx = audioContextRef.current;
    // Los navegadores arrancan el contexto suspendido hasta que hay interacción:
    // sin este resume los primeros sonidos se perdían en silencio.
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }, []);

  const playTone = useCallback((frequency, duration, type = 'sine', gain = 1) => {
    if (mutedRef.current) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = type;

    const peak = Math.max(volumeRef.current * gain, 0.0001);
    gainNode.gain.setValueAtTime(peak, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  }, [getAudioContext]);

  /** Ruido blanco filtrado: sirve de base para chapoteos y explosiones. */
  const playNoise = useCallback(({ duration, decay, cutoff, sweepTo, gain }) => {
    if (mutedRef.current) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * decay));
    }

    const source = ctx.createBufferSource();
    const gainNode = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, ctx.currentTime);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, ctx.currentTime + duration);

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);
    gainNode.gain.value = volumeRef.current * gain;
    source.start();
  }, [getAudioContext]);

  const playWaterSound = useCallback(
    () => playNoise({ duration: 0.3, decay: 0.2, cutoff: 800, gain: 0.3 }),
    [playNoise]
  );

  const playExplosionSound = useCallback(
    () => playNoise({ duration: 0.4, decay: 0.15, cutoff: 1200, sweepTo: 100, gain: 0.5 }),
    [playNoise]
  );

  const playHitSound = useCallback(() => {
    playTone(440, 0.15, 'square', 0.7);
    later(() => playTone(330, 0.1, 'square', 0.7), 50);
  }, [playTone, later]);

  const playSinkSound = useCallback(() => {
    [660, 550, 440, 330].forEach((freq, i) => {
      later(() => playTone(freq, 0.2 + i * 0.05, 'sawtooth', 0.6), i * 100);
    });
  }, [playTone, later]);

  const playVictorySound = useCallback(() => {
    [523, 587, 659, 698, 784].forEach((freq, i) => {
      later(() => playTone(freq, 0.3, 'sine'), i * 150);
    });
  }, [playTone, later]);

  const playDefeatSound = useCallback(() => {
    [440, 415, 392, 370, 330].forEach((freq, i) => {
      later(() => playTone(freq, 0.4, 'triangle'), i * 200);
    });
  }, [playTone, later]);

  const playClickSound = useCallback(() => playTone(800, 0.05, 'sine', 0.5), [playTone]);

  return {
    isMuted,
    setIsMuted,
    volume,
    setVolume,
    playWaterSound,
    playExplosionSound,
    playHitSound,
    playSinkSound,
    playVictorySound,
    playDefeatSound,
    playClickSound,
  };
};

export default useSound;
