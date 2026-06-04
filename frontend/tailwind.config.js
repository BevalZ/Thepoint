/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0a0a0c',
          elevated: '#141417',
          hover: '#1c1c21',
        },
        border: {
          DEFAULT: 'rgba(255,255,255,0.08)',
          strong: 'rgba(255,255,255,0.14)',
        },
        accent: {
          DEFAULT: '#6366f1',
          hover: '#7c7ff5',
        },
        fg: {
          DEFAULT: '#ededed',
          muted: 'rgba(255,255,255,0.55)',
          faint: 'rgba(255,255,255,0.35)',
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
