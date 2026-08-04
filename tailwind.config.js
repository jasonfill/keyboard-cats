/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Baloo 2"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        cream: '#fff7ec',
        grape: '#6d28d9',
        bubble: '#ec4899',
        sky: '#38bdf8',
        lime: '#84cc16',
        sun: '#f59e0b',
      },
      keyframes: {
        pop: {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.25)' },
          '100%': { transform: 'scale(1)' },
        },
        wiggle: {
          '0%,100%': { transform: 'rotate(-4deg)' },
          '50%': { transform: 'rotate(4deg)' },
        },
        floaty: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        pounce: {
          '0%': { transform: 'translateY(0) scale(1)' },
          '30%': { transform: 'translateY(-24px) scale(1.1)' },
          '100%': { transform: 'translateY(0) scale(1)' },
        },
        confettiFall: {
          '0%': { transform: 'translateY(-20px) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateY(120px) rotate(360deg)', opacity: '0' },
        },
        shake: {
          '0%,100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-6px)' },
          '75%': { transform: 'translateX(6px)' },
        },
      },
      animation: {
        pop: 'pop 0.25s ease-in-out',
        wiggle: 'wiggle 0.4s ease-in-out',
        floaty: 'floaty 3s ease-in-out infinite',
        pounce: 'pounce 0.5s ease-in-out',
        'confetti-fall': 'confettiFall 1.2s ease-in forwards',
        shake: 'shake 0.3s ease-in-out',
      },
    },
  },
  plugins: [],
}
