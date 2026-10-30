/* Запросы к серверу про аккаунт: регистрация, вход, выход, смена пароля, удаление. */
import { apiUrl } from '../apiBase';
import type { Session } from './session';

const MESSAGES: Record<string, string> = {
  invalid_email: 'Проверьте адрес почты',
  weak_password: 'Пароль должен быть не короче 8 символов',
  email_taken: 'Эта почта уже зарегистрирована. Попробуйте войти',
  bad_credentials: 'Неверная почта или пароль',
  too_many_attempts: 'Слишком много попыток. Подождите немного и повторите',
  unauthorized: 'Нужно войти заново',
};

/** Ошибка с понятным пользователю текстом. */
export class AuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 20_000;

async function call(path: string, init: { method: string; body?: unknown; token?: string }): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl(path), {
      method: init.method,
      signal: ctrl.signal,
      headers: { ...(init.body === undefined ? {} : { 'content-type': 'application/json' }), ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      const code = data.error ?? 'error';
      throw new AuthError(code, MESSAGES[code] ?? `Сервер ответил ошибкой (${String(res.status)})`);
    }
    return data;
  } catch (e) {
    if (e instanceof AuthError) throw e;
    if (e instanceof DOMException && e.name === 'AbortError') throw new AuthError('timeout', 'Сервер не отвечает. Проверьте интернет и повторите');
    throw new AuthError('network', 'Не удалось связаться с сервером. Проверьте интернет и повторите');
  } finally {
    clearTimeout(timer);
  }
}

/** Короткое название устройства для списка сессий на сервере. */
function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Браузер';
}

export const registerAccount = (email: string, password: string) =>
  call('auth/register', { method: 'POST', body: { email, password, device: deviceLabel() } }) as Promise<Session>;

export const loginAccount = (email: string, password: string) =>
  call('auth/login', { method: 'POST', body: { email, password, device: deviceLabel() } }) as Promise<Session>;

export const logoutAccount = (token: string) => call('auth/logout', { method: 'POST', token });

export const changePassword = (token: string, oldPassword: string, newPassword: string) =>
  call('auth/password', { method: 'POST', token, body: { oldPassword, newPassword } });

export const deleteAccount = (token: string, password: string) => call('auth/account', { method: 'DELETE', token, body: { password } });
