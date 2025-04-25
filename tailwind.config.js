/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html", // O el HTML principal de tu proyecto
    "./src/**/*.{js,jsx,ts,tsx}", // O los archivos JS o JSX donde uses clases de Tailwind
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
