/** @type {import('tailwindcss').Config} */

/**
 * Every color below resolves to a custom property defined in
 * `src/styles/tokens.css` — Tailwind owns the utility names, tokens.css owns
 * the values. That is what makes the spec's "no hard-coded hex in components"
 * rule enforceable across ~15k lines of existing utility classes without
 * rewriting them: `bg-dark-700` keeps working, it just stops being a literal.
 *
 * `<alpha-value>` is Tailwind's placeholder for an opacity modifier, so
 * `bg-surface-2/40` still composes. It only works against space-separated RGB
 * channels, which is why tokens.css ships the `--*-rgb` triplets.
 */
const channel = (name) => `rgb(var(${name}) / <alpha-value>)`;

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

        // Flame ramp. 500/600 are the spec's --accent-flame and its pressed
        // state; the rest are tints and shades of it, so a `brand-*` utility
        // anywhere in the app is on-palette by construction.
        brand: {
          50: '#FFF3EC',
          100: '#FFE1D1',
          200: '#FFC2A3',
          300: '#FFA070',
          400: '#FF7F42',
          500: channel('--accent-flame-rgb'),
          600: '#E64B0F',
          700: '#B93A0B',
          800: '#8A2B08',
          900: '#5C1D06',
        },

        // Neutral ramp. The keys are unchanged so existing markup keeps
        // resolving, but the values now step through the obsidian/surface
        // tokens instead of pure grays — which is most of why the app reads
        // as one material rather than as cards on a black rectangle.
        dark: {
          900: channel('--bg-obsidian-rgb'),
          800: '#0F1219',
          700: channel('--surface-1-rgb'),
          600: '#181B27',
          500: channel('--surface-2-rgb'),
          400: channel('--surface-3-rgb'),
          300: '#3D4359',
        },

        // Semantic accents (§2.1). Named `accent-*` rather than folded into
        // Tailwind's default palette so they cannot collide with the `green-`,
        // `blue-`, `red-` scales the app still uses for incidental UI.
        accent: {
          flame: channel('--accent-flame-rgb'),
          crimson: channel('--accent-crimson-rgb'),
          violet: channel('--accent-violet-rgb'),
          cyan: channel('--accent-cyan-rgb'),
          gold: channel('--accent-gold-rgb'),
          green: channel('--accent-green-rgb'),
          blue: channel('--accent-blue-rgb'),
        },

        // Glass + solid surfaces, for the components that opt into the
        // material system directly rather than through <GlassSurface>.
        surface: {
          1: channel('--surface-1-rgb'),
          2: channel('--surface-2-rgb'),
          3: channel('--surface-3-rgb'),
        },
      },

      borderRadius: {
        // §2.3. `xl`/`2xl` are remapped rather than left at Tailwind's 12/16px
        // because the existing markup leans on them heavily — this pulls the
        // whole app onto the spec's scale in one move instead of touching
        // several hundred class strings.
        xl: 'var(--radius-sm)',
        '2xl': 'var(--radius-md)',
        '3xl': 'var(--radius-lg)',
        card: 'var(--radius-lg)',
      },

      boxShadow: {
        1: 'var(--shadow-1)',
        2: 'var(--shadow-2)',
        glow: 'var(--glow-active)',
      },

      spacing: {
        // The §2.2 scale, exposed as named steps. Tailwind's numeric spacing
        // already covers these values; these aliases exist so a component can
        // say `p-space-6` and be obviously on-scale at review time.
        'space-1': 'var(--space-1)',
        'space-2': 'var(--space-2)',
        'space-3': 'var(--space-3)',
        'space-4': 'var(--space-4)',
        'space-5': 'var(--space-5)',
        'space-6': 'var(--space-6)',
        'space-7': 'var(--space-7)',
        'space-8': 'var(--space-8)',
        'space-9': 'var(--space-9)',
        'space-10': 'var(--space-10)',
      },

      transitionTimingFunction: {
        press: 'var(--ease-press)',
      },
    },
  },
  plugins: [],
}
