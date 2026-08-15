import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ConfirmProvider } from './ui';
import './styles.css';
import './ui.css';

createRoot(document.getElementById('root')!).render(<StrictMode><ConfirmProvider><App /></ConfirmProvider></StrictMode>);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}

if (import.meta.env.PROD) {
  const prefetchLazyViews = () => {
    void import('./views/Trends');
    void import('./views/Archive');
    void import('./views/Settings');
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(prefetchLazyViews, { timeout: 4000 });
  else setTimeout(prefetchLazyViews, 3000);
}
