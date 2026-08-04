/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Tertiary text tone. Tailwind's gray-500 (#6b7280) was carrying every
        // hint, timestamp and caption in the app, but it never clears WCAG AA
        // on these surfaces — 3.29:1 on dark-600, 2.97:1 on dark-500, against a
        // 4.5:1 floor for the 11-12px sizes it runs at. Bumping it all the way
        // to gray-400 would have fixed contrast by collapsing two tiers of
        // hierarchy into one, so this sits between them: dimmer than gray-400,
        // and still >= 4.6:1 on every background the app actually puts text on.
        gray: {
          450: '#8c94a1',
        },
        brand: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        dark: {
          900: '#0a0a0a',
          800: '#111111',
          700: '#1a1a1a',
          600: '#222222',
          500: '#2a2a2a',
          400: '#333333',
          300: '#444444',
        }
      },
    },
  },
  plugins: [],
}

