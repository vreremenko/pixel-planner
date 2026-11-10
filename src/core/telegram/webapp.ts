/*
 * Запуск внутри Telegram (Mini App). Telegram кладёт данные запуска в адрес после #, а у нас по # работает навигация,
 * поэтому их забирают до старта приложения (импорт этого файла идёт первым в main.tsx) и адрес сразу очищается.
 * Скрипт Telegram не подключаем: telegram.org из России открывается плохо, а нужные события отправляются напрямую.
 */
const KEY = 'pixel-planner:tg-init';

declare global {
  interface Window {
    TelegramWebviewProxy?: { postEvent(type: string, data: string): void };
    Telegram?: { WebView?: { receiveEvent(type: string, data: unknown): void } };
    TelegramGameProxy?: { receiveEvent(type: string, data: unknown): void };
    TelegramGameProxy_receiveEvent?: (type: string, data: unknown) => void;
  }
}

/**
 * Точно ли мы внутри Telegram. Родные приложения дают странице TelegramWebviewProxy, Telegram Web открывает её во фрейме
 * со своего адреса. Одной ссылки с tgWebAppData мало: её можно прислать человеку в обычный браузер, и приложение
 * переключилось бы на аккаунт из чужих данных запуска.
 */
function insideTelegram(): boolean {
  if (typeof window.TelegramWebviewProxy?.postEvent === 'function') return true;
  if (window.parent === window) return false;
  const parent = (location as { ancestorOrigins?: DOMStringList }).ancestorOrigins?.[0] ?? document.referrer;
  try {
    return /(^|\.)telegram\.org$/.test(new URL(parent).hostname);
  } catch {
    return false;
  }
}

function capture(): string | null {
  try {
    const hash = new URLSearchParams(location.hash.slice(1));
    const data = hash.get('tgWebAppData');
    if (!insideTelegram()) {
      sessionStorage.removeItem(KEY);
      if (data) history.replaceState(null, '', `${location.pathname}${location.search}#/`);
      return null;
    }
    if (data) {
      sessionStorage.setItem(KEY, data);
      history.replaceState(null, '', `${location.pathname}${location.search}#/`);
      return data;
    }
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

const initData = typeof window === 'undefined' ? null : capture();

/** Подписанные данные пользователя Telegram; null — открыто не в Telegram. */
export const telegramInitData = (): string | null => initData;
export const inTelegram = (): boolean => initData !== null;

function post(type: string, data: unknown = {}): void {
  if (!inTelegram()) return;
  const body = JSON.stringify(data);
  if (window.TelegramWebviewProxy) window.TelegramWebviewProxy.postEvent(type, body);
  else if (window.parent !== window) window.parent.postMessage(JSON.stringify({ eventType: type, eventData: data }), '*');
}

const handlers = new Map<string, () => void>();
if (typeof window !== 'undefined' && inTelegram()) {
  // Разные приложения Telegram зовут разные функции: iOS и Android — Telegram.WebView, компьютерные — TelegramGameProxy
  const receive = (type: string) => handlers.get(type)?.();
  window.Telegram = { ...window.Telegram, WebView: { receiveEvent: receive } };
  window.TelegramGameProxy = { receiveEvent: receive };
  window.TelegramGameProxy_receiveEvent = receive;
  // Telegram Web присылает события сообщениями окна, строкой или объектом
  window.addEventListener('message', (e: MessageEvent) => {
    try {
      const msg = (typeof e.data === 'string' ? JSON.parse(e.data) : e.data) as { eventType?: unknown } | null;
      if (typeof msg?.eventType === 'string') receive(msg.eventType);
    } catch {
      // чужие сообщения
    }
  });
}

/** Сообщить Telegram, что приложение готово: развернуть на весь экран и покрасить шапку в цвет приложения. */
export function telegramReady(): void {
  if (!inTelegram()) return;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--c-bg').trim() || '#0d0b1f';
  post('web_app_ready');
  post('web_app_expand');
  post('web_app_set_header_color', { color: bg });
  post('web_app_set_background_color', { color: bg });
}

/** Системная кнопка «Назад» в шапке Telegram. */
export function telegramBackButton(visible: boolean, onBack: () => void): void {
  if (!inTelegram()) return;
  handlers.set('back_button_pressed', onBack);
  post('web_app_setup_back_button', { is_visible: visible });
}
