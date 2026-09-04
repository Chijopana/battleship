/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta naval: fondo de océano profundo + acentos de radar
        abyss: '#04121f',
        deep: '#0a2036',
        hull: '#12304d',
        radar: '#38bdf8',
        sonar: '#22d3ee',
        hit: '#fb923c',
        sunk: '#e11d48',
        steel: '#94a3b8',
      },
      fontFamily: {
        display: ['"Rajdhani"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 20px 45px -25px rgba(0, 0, 0, 0.9)',
        glow: '0 0 20px -2px rgba(56, 189, 248, 0.55)',
      },
      keyframes: {
        splash: {
          '0%': { transform: 'scale(0.4)', opacity: '0.9' },
          '100%': { transform: 'scale(1.9)', opacity: '0' },
        },
        blast: {
          '0%': { transform: 'scale(0.6)', opacity: '1' },
          '60%': { transform: 'scale(1.35)', opacity: '0.75' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        riseIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        sweep: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        bob: {
          '0%, 100%': { transform: 'translateY(-2px)' },
          '50%': { transform: 'translateY(2px)' },
        },
      },
      animation: {
        splash: 'splash 0.6s ease-out forwards',
        blast: 'blast 0.45s ease-out',
        'rise-in': 'riseIn 0.25s ease-out both',
        sweep: 'sweep 4s linear infinite',
        bob: 'bob 4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
