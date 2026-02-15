import React, { useState } from 'react';

/**
 * Componente de control de audio (volumen, mute, música)
 */
const AudioController = ({ isMuted, setIsMuted, volume, setVolume }) => {
  const [showControls, setShowControls] = useState(false);

  return (
    <div className="fixed top-4 right-4 z-50">
      <div className="flex flex-col items-end gap-2">
        {/* Botón principal de audio */}
        <button
          onClick={() => setShowControls(!showControls)}
          className="bg-white/90 hover:bg-white backdrop-blur rounded-full p-3 shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-110"
          aria-label="Controles de audio"
        >
          <span className="text-2xl">
            {isMuted ? '🔇' : volume > 0.5 ? '🔊' : '🔉'}
          </span>
        </button>

        {/* Panel de controles desplegable */}
        {showControls && (
          <div className="bg-white/95 backdrop-blur rounded-xl p-4 shadow-2xl animate-slide-in space-y-3 min-w-[200px]">
            <h3 className="font-bold text-gray-800 text-sm mb-2">🎵 Audio</h3>
            
            {/* Control de mute */}
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`w-full py-2 px-3 rounded-lg font-semibold transition-all duration-200 ${
                isMuted 
                  ? 'bg-red-500 hover:bg-red-600 text-white' 
                  : 'bg-green-500 hover:bg-green-600 text-white'
              }`}
            >
              {isMuted ? '🔇 Silenciado' : '🔊 Sonido ON'}
            </button>

            {/* Slider de volumen */}
            <div className="space-y-1">
              <label className="text-xs text-gray-600 font-medium">
                Volumen: {Math.round(volume * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={volume * 100}
                onChange={(e) => setVolume(e.target.value / 100)}
                disabled={isMuted}
                className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50"
              />
            </div>

            {/* Presets de volumen */}
            <div className="flex gap-2">
              <button
                onClick={() => setVolume(0.25)}
                className="flex-1 py-1 px-2 text-xs bg-gray-200 hover:bg-gray-300 rounded transition-colors"
                disabled={isMuted}
              >
                25%
              </button>
              <button
                onClick={() => setVolume(0.5)}
                className="flex-1 py-1 px-2 text-xs bg-gray-200 hover:bg-gray-300 rounded transition-colors"
                disabled={isMuted}
              >
                50%
              </button>
              <button
                onClick={() => setVolume(0.75)}
                className="flex-1 py-1 px-2 text-xs bg-gray-200 hover:bg-gray-300 rounded transition-colors"
                disabled={isMuted}
              >
                75%
              </button>
              <button
                onClick={() => setVolume(1)}
                className="flex-1 py-1 px-2 text-xs bg-gray-200 hover:bg-gray-300 rounded transition-colors"
                disabled={isMuted}
              >
                Max
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AudioController;
