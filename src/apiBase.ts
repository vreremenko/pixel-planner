/**
 * Адрес push-API. По умолчанию — тот же сайт (/api/), как на Cloudflare Workers.
 * Если фронтенд лежит на другом хостинге (GitHub Pages), при сборке задаётся
 * VITE_API_BASE=https://<воркер>.workers.dev/
 *
 * Для проверки другого сервера (например, в Yandex Cloud) адрес можно переопределить на устройстве:
 * Настройки → «Сеть и сервер». Переопределение лежит в localStorage и действует только в окне
 * приложения; service worker (кнопка «Отложить» в уведомлении) по-прежнему ходит на адрес по умолчанию.
 */
const base: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? import.meta.env.BASE_URL;

export const API_OVERRIDE_KEY = 'pp-api';

export function getApiOverride(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(API_OVERRIDE_KEY);
  } catch {
    return null;
  }
}

export function setApiOverride(url: string | null): void {
  try {
    if (url) localStorage.setItem(API_OVERRIDE_KEY, url);
    else localStorage.removeItem(API_OVERRIDE_KEY);
  } catch {
    // без localStorage остаётся адрес по умолчанию
  }
}

export const defaultApiBase = (): string => new URL(base, self.location.href).href;

export const apiUrl = (path: string): string => new URL(`api/${path}`, new URL(getApiOverride() ?? base, self.location.href)).href;
