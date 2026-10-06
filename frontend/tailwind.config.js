/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        luxe: {
          bg: 'var(--bg)',
          bg2: 'var(--bg2)',
          card: 'var(--card)',
          line: 'var(--line)',
          tx: 'var(--tx)',
          mut: 'var(--mut)',
          em: 'var(--em)',
          gold: 'var(--gold)',
          amber: 'var(--amber)',
          sky: 'var(--sky)',
        },
        brand: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#34d6a0',
          600: '#14946b',
          700: '#0f7f5d',
        },
        slate: {
          850: '#0c1916',
          900: '#0c1916',
          950: '#07100e',
        }
      },
      fontFamily: {
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        sans: ['Manrope', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        'card': '36px',
        'inner': '24px',
        'input': '16px',
        'pill': '99px',
      },
      boxShadow: {
        'luxe': '0 40px 90px -40px #000',
        'luxe-glow': '0 0 0 4px #34d6a014, 0 24px 60px -28px #34d6a0',
        'amber-glow': '0 0 0 4px #f0b44c14, 0 24px 60px -28px #f0b44c',
      },
      animation: {
        'panel-in': 'in 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        in: {
          'from': { opacity: '0', transform: 'translateY(14px)' },
          'to': { opacity: '1', transform: 'translateY(0)' },
        }
      }
    },
  },
  plugins: [],
};
