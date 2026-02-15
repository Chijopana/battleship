import { useRef, useCallback, useState } from 'react';

/**
 * Hook para manejar efectos de sonido usando Web Audio API
 */
const useSound = () => {
  const audioContextRef = useRef(null);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.5);

  // Inicializar AudioContext
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  // Generar tono con Web Audio API
  const playTone = useCallback((frequency, duration, type = 'sine') => {
    if (isMuted) return;

    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = type;

    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  }, [isMuted, volume, getAudioContext]);

  // Efecto de agua (splash)
  const playWaterSound = useCallback(() => {
    if (isMuted) return;
    const ctx = getAudioContext();
    const bufferSize = ctx.sampleRate * 0.3;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
    }

    const source = ctx.createBufferSource();
    const gainNode = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = 800;

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    gainNode.gain.value = volume * 0.3;
    source.start();
  }, [isMuted, volume, getAudioContext]);

  // Efecto de explosión
  const playExplosionSound = useCallback(() => {
    if (isMuted) return;
    const ctx = getAudioContext();
    const bufferSize = ctx.sampleRate * 0.4;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
    }

    const source = ctx.createBufferSource();
    const gainNode = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.4);

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    gainNode.gain.value = volume * 0.5;
    source.start();
  }, [isMuted, volume, getAudioContext]);

  // Efecto de impacto (hit)
  const playHitSound = useCallback(() => {
    playTone(440, 0.15, 'square');
    setTimeout(() => playTone(330, 0.1, 'square'), 50);
  }, [playTone]);

  // Efecto de hundido (sink)
  const playSinkSound = useCallback(() => {
    playTone(660, 0.1, 'sawtooth');
    setTimeout(() => playTone(550, 0.1, 'sawtooth'), 100);
    setTimeout(() => playTone(440, 0.2, 'sawtooth'), 200);
    setTimeout(() => playTone(330, 0.3, 'sawtooth'), 300);
  }, [playTone]);

  // Efecto de victoria
  const playVictorySound = useCallback(() => {
    const notes = [523, 587, 659, 698, 784];
    notes.forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.3, 'sine'), i * 150);
    });
  }, [playTone]);

  // Efecto de derrota
  const playDefeatSound = useCallback(() => {
    const notes = [440, 415, 392, 370, 330];
    notes.forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.4, 'triangle'), i * 200);
    });
  }, [playTone]);

  // Efecto de click
  const playClickSound = useCallback(() => {
    playTone(800, 0.05, 'sine');
  }, [playTone]);

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
