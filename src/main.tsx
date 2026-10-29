import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts';
import './styles/base.css';
import './styles/crt.css';
import './styles/mom.css';
import { App } from './app/App';
import { ErrorBoundary } from './app/ErrorBoundary';
import { useSettings } from './stores/settings';
import { setupPwa } from './features/pwa/register';

declare global {
  interface Window {
    __appMounted?: boolean;
  }
}

// Интерфейс рисуем сразу: на iOS открытие IndexedDB в установленном приложении
// бывает очень медленным, и ожидание базы перед рендером давало белый экран.
createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
window.__appMounted = true;

void useSettings.getState().load();

try {
  setupPwa();
} catch (e) {
  console.error('PWA setup failed', e);
}
