/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        navy: { 700: '#16254a', 800: '#0f1b3a', 900: '#0a1228' },
        gaze: { 500: '#8b5cf6', 600: '#7c3aed' },
      },
    },
  },
  plugins: [],
};
