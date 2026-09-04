import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

const PRESETS = [
  { label: '25', value: 0.25 },
  { label: '50', value: 0.5 },
  { label: '75', value: 0.75 },
  { label: 'Máx', value: 1 },
];

/**
 * Control de audio en un desplegable. Se cierra al hacer click fuera o con Escape.
 */
const AudioController = ({ isMuted, setIsMuted, volume, setVolume }) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e) => {
      if (!wrapperRef.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => { if (e.key === 'Escape') setOpen(false); };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const icon = isMuted ? '🔇' : volume > 0.5 ? '🔊' : '🔉';

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Ajustes de sonido"
        className={clsx(
          'btn h-11 w-11 rounded-xl border border-white/15 bg-white/5 p-0 text-lg',
          'hover:border-radar/50 hover:bg-white/10',
          open && 'border-radar/60 bg-white/10'
        )}
      >
        <span aria-hidden="true">{icon}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Sonido"
          className="animate-rise-in panel absolute right-0 z-50 mt-2 w-56 space-y-3 p-4"
        >
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={clsx('btn w-full', isMuted ? 'btn-danger' : 'btn-primary')}
          >
            {isMuted ? 'Sonido silenciado' : 'Sonido activo'}
          </button>

          <div className="space-y-1.5">
            <label htmlFor="volume" className="panel-heading block">
              Volumen · {Math.round(volume * 100)}%
            </label>
            <input
              id="volume"
              type="range"
              min="0"
              max="100"
              step="5"
              value={Math.round(volume * 100)}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
              disabled={isMuted}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-radar disabled:cursor-not-allowed disabled:opacity-40"
            />
          </div>

          <div className="flex gap-1.5">
            {PRESETS.map(({ label, value }) => (
              <button
                key={label}
                onClick={() => setVolume(value)}
                disabled={isMuted}
                className={clsx(
                  'btn flex-1 px-0 py-1.5 text-xs',
                  Math.abs(volume - value) < 0.01
                    ? 'bg-radar text-abyss'
                    : 'border border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AudioController;
