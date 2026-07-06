/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        spotify: {
          green: '#1db954',
          black: '#121212',
          dark: '#181818',
          gray: '#282828',
          light: '#b3b3b3',
        },
      },
    },
  },
  plugins: [],
};
