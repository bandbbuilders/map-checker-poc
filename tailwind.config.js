/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'battle-olive': 'rgba(20, 24, 15, 0.75)',
        'laser-green': '#39FF14',
        'near-black': '#0D0D0D',
        'military-red': '#E63946',
      },
      backdropBlur: {
        'xs': '2px',
        'sm': '4px',
        'md': '12px',
        'lg': '20px',
      },
      saturate: {
        '180': '1.8',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      letterSpacing: {
        'wide-tracking': '0.3em',
      }
    },
  },
  plugins: [],
}
