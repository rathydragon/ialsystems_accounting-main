import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Automatically catch Vite dynamic preload chunk errors (e.g. after a new deployment or network hiccup)
window.addEventListener('vite:preloadError', (event) => {
  console.warn('Vite dynamic chunk preload error detected. Auto-reloading with cache busting...', event);
  event.preventDefault();
  const reloadKey = 'vite_preload_auto_reload';
  const lastReload = sessionStorage.getItem(reloadKey);
  const now = Date.now();
  // Prevent infinite loops: reload only if last reload was > 10 seconds ago
  if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
    sessionStorage.setItem(reloadKey, String(now));
    if ('caches' in window) {
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).catch(() => {});
    }
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.set('_v', now.toString());
    window.location.href = window.location.pathname + '?' + searchParams.toString() + window.location.hash;
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallbackTitle="IAL Systems Accounting - Application Error">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

