import type { Config } from 'tailwindcss';

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        elevated: v('elevated'),
        ink: v('ink'),
        muted: v('muted'),
        line: v('line'),
        saffron: { 50: '#fff7eb', 100: '#ffe9c7', 200: '#ffd28a', 300: '#ffb84d', 400: '#ff9f1c', 500: '#f58a07', 600: '#d96b02', 700: '#b34f06', 800: '#8f3d0c', 900: '#76330e' },
        gold: { 200: '#fbe7a1', 300: '#f7d56b', 400: '#f5c451', 500: '#e8a923', 600: '#c98a12' },
        maroon: { 300: '#c45a74', 400: '#a3324f', 500: '#7a1530', 600: '#5e1024', 700: '#4a0d1c', 800: '#360916', 900: '#22050e' },
        indigo: { 300: '#8b85e0', 400: '#6a62cf', 500: '#4c42b5', 600: '#3a3194', 700: '#2b2470', 800: '#1e1a52', 900: '#140f36' },
        primary: v('primary'),
        accent: v('accent'),
        success: v('success'),
        danger: v('danger'),
        warn: v('warn'),
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Noto Sans Devanagari"', 'system-ui', 'sans-serif'],
        display: ['"Cormorant Garamond"', '"Tiro Devanagari Sanskrit"', 'Georgia', 'serif'],
        chant: ['"Tiro Devanagari Sanskrit"', '"Noto Serif Devanagari"', '"Noto Sans Devanagari"', 'serif'],
      },
      borderRadius: { '4xl': '2rem' },
      boxShadow: {
        glow: '0 0 0 1px rgb(var(--primary) / .25), 0 10px 40px -10px rgb(var(--primary) / .45)',
        card: '0 1px 0 0 rgb(255 255 255 / .06) inset, 0 20px 50px -24px rgb(0 0 0 / .55)',
      },
      backgroundImage: {
        'devotional': 'radial-gradient(1200px 600px at 10% -10%, rgb(var(--glow-a) / .55), transparent 60%), radial-gradient(900px 500px at 110% 10%, rgb(var(--glow-b) / .45), transparent 60%), linear-gradient(180deg, rgb(var(--bg)) 0%, rgb(var(--bg-2)) 100%)',
        'gold-sheen': 'linear-gradient(135deg, #ffe08a 0%, #f5a524 45%, #d9771a 100%)',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'spin-slow': { to: { transform: 'rotate(360deg)' } },
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        pulsering: { '0%': { transform: 'scale(.9)', opacity: '.7' }, '100%': { transform: 'scale(1.6)', opacity: '0' } },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        'spin-slow': 'spin-slow 120s linear infinite',
        floaty: 'floaty 5s ease-in-out infinite',
        pulsering: 'pulsering 1.6s ease-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
