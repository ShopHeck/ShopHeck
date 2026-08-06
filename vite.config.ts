import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Fight Camp Training',
        short_name: 'Fight Camp',
        description: 'Combat sports training camp planner for fighters and coaches',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        // All three are cut from the same source as the iOS AppIcon (see
        // scripts/generate-icons.mjs). The maskable variant is a separate file
        // because Android crops a circle out of the icon: declaring the
        // full-bleed art as `maskable` clipped the wordmark off the lockup.
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // woff2 only, never woff: the .woff files exist purely as a fallback for
        // browsers that predate woff2, and no browser fetches both. Precaching
        // both would double the font cost for bytes nothing requests.
        // Without the fonts here, an installed PWA opened offline (a gym with no
        // signal — the actual use case) falls back to system-ui and swaps on
        // every cold start; @fontsource sets font-display: swap, so the text is
        // never invisible, but the reflow is.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Two large images live in public/ for other consumers, not for the
        // app: the 1024px App Store submission icon and the Open Graph card
        // (fetched by crawlers, never by the page). Precaching them cost ~1.8 MB
        // of every first visit's data for bytes the app never requests.
        globIgnores: ['**/AppIcon-*.png', '**/og-image.png'],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Only libraries that are genuinely on the first-paint path get a named
        // chunk — a named chunk is treated as a static import of the entry and
        // gets a <link rel="modulepreload">, so it is downloaded before the app
        // renders.
        //
        // `charts: ['recharts']` and `utils: ['date-fns','lucide-react']` used
        // to live here. Every recharts consumer (WeightTracker, ProgressCharts,
        // CampComparison, CoachDashboard) is lazy-loaded, but naming the chunk
        // hoisted it onto the critical path anyway: ~114 kB gzipped of chart
        // code preloaded for users who may never open a chart. Left unnamed,
        // Rollup keeps recharts inside the async chunks that actually use it,
        // and date-fns/lucide-react tree-shake into whatever imports them.
        //
        // `supabase: ['@supabase/supabase-js']` left for the same reason once
        // `lib/supabase.ts` stopped importing the SDK statically (see
        // `getSupabase`). Naming it would have re-promoted the 203 kB SDK to a
        // preloaded static import of the entry and undone the deferral.
        //
        // Sentry stays named and stays static: `main.tsx` renders
        // `SentryReact.ErrorBoundary` as the app's crash boundary, so deferring
        // it would leave a window on every cold start where a crash is caught
        // by nothing and reported to nobody. 11 kB gzipped is the right price
        // for that.
        manualChunks: {
          vendor: ['react', 'react-dom'],
          sentry: ['@sentry/capacitor', '@sentry/react'],
        },
      },
    },
  },
})
