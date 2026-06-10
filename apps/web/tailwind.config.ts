import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
      },
      colors: {
        felt: {
          light: '#2a8c52',
          DEFAULT: '#1a6b3c',
          dark: '#0f4f2a',
          darker: '#0a3a1f',
        },
        wood: {
          light: '#8a5a2b',
          DEFAULT: '#5d3a1a',
          dark: '#3e2511',
        },
        gold: {
          light: '#f0cf7a',
          DEFAULT: '#d4a942',
          dark: '#a87f24',
        },
      },
      boxShadow: {
        card: '0 2px 4px rgba(0,0,0,0.3), 0 8px 20px rgba(0,0,0,0.45)',
        'card-lifted': '0 6px 10px rgba(0,0,0,0.35), 0 18px 40px rgba(0,0,0,0.5)',
        table: 'inset 0 0 120px rgba(0,0,0,0.5), inset 0 0 16px rgba(0,0,0,0.35), 0 30px 80px rgba(0,0,0,0.55)',
        glow: '0 0 24px rgba(212,169,66,0.45)',
      },
      keyframes: {
        'deal-in': {
          '0%': { transform: 'translateY(-40px) scale(0.8) rotate(-4deg)', opacity: '0' },
          '100%': { transform: 'translateY(0) scale(1) rotate(0deg)', opacity: '1' },
        },
        'pop-in': {
          '0%': { transform: 'scale(0.5)', opacity: '0' },
          '70%': { transform: 'scale(1.06)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'vira-flip': {
          '0%': { transform: 'rotateY(0deg)' },
          '100%': { transform: 'rotateY(180deg)' },
        },
        'float-up': {
          '0%': { transform: 'translateY(0) scale(0.8)', opacity: '0' },
          '20%': { transform: 'translateY(-10px) scale(1.15)', opacity: '1' },
          '100%': { transform: 'translateY(-70px) scale(1)', opacity: '0' },
        },
        'pulse-gold': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(212,169,66,0.55)' },
          '50%': { boxShadow: '0 0 0 12px rgba(212,169,66,0)' },
        },
        'pulse-ring': {
          '0%, 100%': { boxShadow: '0 0 0 3px rgba(212,169,66,0.9), 0 0 18px rgba(212,169,66,0.5)' },
          '50%': { boxShadow: '0 0 0 5px rgba(212,169,66,0.5), 0 0 28px rgba(212,169,66,0.3)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'float-soft': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      animation: {
        'deal-in': 'deal-in 0.4s cubic-bezier(0.2, 0.9, 0.3, 1.2)',
        'pop-in': 'pop-in 0.3s cubic-bezier(0.2, 0.9, 0.3, 1.2)',
        'vira-flip': 'vira-flip 0.7s ease-out 0.35s both',
        'float-up': 'float-up 1.8s ease-out forwards',
        'pulse-gold': 'pulse-gold 1.6s infinite',
        'pulse-ring': 'pulse-ring 1.4s infinite',
        shimmer: 'shimmer 2.5s linear infinite',
        marquee: 'marquee 22s linear infinite',
        'float-soft': 'float-soft 5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
