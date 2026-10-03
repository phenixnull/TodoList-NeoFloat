/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg0: '#05060f',
        bg1: '#0b1025',
        bg2: '#110c25',
        ink: '#f8fafc',
        muted: '#cbd5e1',
        subtle: '#94a3b8',
        accent: {
          DEFAULT: '#22d3ee',
          soft: '#67e8f9',
        },
        success: '#22c55e',
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Microsoft YaHei',
          'sans-serif',
        ],
      },
      boxShadow: {
        glow: '0 0 24px rgba(34,211,238,0.18)',
        card: '0 18px 50px rgba(0,0,0,0.45)',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
    },
  },
  plugins: [],
};
