import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ConfirmProvider } from './ui';
import './styles/theme-tokens.css';
import './styles/foundations.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/light.css';
import './styles/hero-records.css';
import './styles/dark.css';
import './styles/charts.css';
import './styles/chat.css';
import './styles/milestone.css';
import './ui.css';
import './styles/components.css';
import './styles/theme-system.css';
import './styles/theme-basic-shapes.css';
import './styles/theme-glass-park.css';
import './styles/theme-moon-camp.css';
import './styles/theme-jiangnan-market.css';
import './styles/theme-desert-oasis.css';
import './styles/theme-dino-museum.css';
import './styles/theme-midsummer-dream.css';
import './styles/theme-bamboo-court.css';
import './styles/theme-block-factory.css';
import './styles/theme-immortal-gate.css';
import './styles/theme-travel.css';
import './styles/theme-orbit.css';
import './styles/theme-shop.css';
import './styles/theme-arcane.css';
import './styles/theme-ocean.css';
import './styles/theme-forest-press.css';
import './styles/theme-fruit-cake.css';

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
