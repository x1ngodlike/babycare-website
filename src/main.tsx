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
