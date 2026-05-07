import * as Sentry from '@sentry/capacitor';
import * as SentryReact from '@sentry/react';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

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
    <SentryReact.ErrorBoundary fallback={<div style={{ color: '#fff', padding: '2rem', textAlign: 'center' }}>Something went wrong. Please restart the app.</div>}>
      <App />
    </SentryReact.ErrorBoundary>
  </StrictMode>,
)
