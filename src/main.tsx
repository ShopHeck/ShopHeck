import * as Sentry from '@sentry/capacitor';
import * as SentryReact from '@sentry/react';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// index.css has always named 'Inter' as the first font family, but nothing ever
// loaded it — @fontsource/inter was a dependency imported nowhere, so the app
// silently rendered in system-ui on every platform. Latin subset only (the app
// ships English), and only the weights actually requested in src/: 400, 500
// (font-medium), 600 (font-semibold), 700 (font-bold), 800 and 900
// (font-black). 800 was previously absent because nothing used it; the design
// system's Metric Large style now pins large metrics at 800 (§2.5), so a
// missing 800 would silently synthesise or round to 700 and flatten the one
// piece of type the whole hierarchy is built around.
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/inter/latin-800.css'
import '@fontsource/inter/latin-900.css'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext'

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    release: 'fight-camp-training@1.0.0',
    integrations: [SentryReact.browserTracingIntegration()],
    tracesSampleRate: 0.1,
  }, SentryReact.init);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SentryReact.ErrorBoundary
      fallback={
        <div style={{ color: '#fff', padding: '2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', minHeight: '100vh', justifyContent: 'center' }}>
          <p style={{ fontWeight: 700 }}>Something went wrong.</p>
          <button
            onClick={() => window.location.reload()}
            /* Hard-coded rather than tokenised on purpose: this is the crash
               fallback, and it has to render even if the stylesheet carrying
               the custom properties is the thing that failed to load. */
            style={{ background: '#FF5E1A', color: '#fff', border: 'none', borderRadius: '0.75rem', padding: '0.75rem 1.5rem', fontWeight: 600, fontSize: '1rem' }}
          >
            Reload
          </button>
        </div>
      }
    >
      <AuthProvider>
        <App />
      </AuthProvider>
    </SentryReact.ErrorBoundary>
  </StrictMode>,
)
