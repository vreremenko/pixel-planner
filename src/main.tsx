// Первым: данные запуска из Telegram нужно забрать из адреса до старта навигации
import './core/telegram/webapp';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './core/styles/fonts';
import './core/styles/base.css';
import './core/styles/crt.css';
import './core/styles/mom.css';
import { App } from './core/shell/App';
import { ErrorBoundary } from './core/shell/ErrorBoundary';
import { useSettings } from './core/stores/settings';
import { setupPwa } from './core/pwa/register';
import { reloadOnce } from './core/shell/chunkReload';

declare global {
  interface Window {
    __appMounted?: boolean;
  }
}

// Устаревший кусок приложения после выкладки: тихо перезагружаемся на новую версию
window.addEventListener('vite:preloadError', (e) => {
  if (reloadOnce()) e.preventDefault();
});

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
