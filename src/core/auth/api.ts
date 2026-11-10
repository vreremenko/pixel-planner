/* Запросы к серверу про аккаунт: регистрация, вход, выход, смена пароля, удаление. */
import { apiUrl } from '../apiBase';
import { APP_VERSION } from '../changelog';
import type { Session } from './session';

const MESSAGES: Record<string, string> = {
  invalid_email: 'Проверьте адрес почты',
  weak_password: 'Пароль должен быть не короче 8 символов',
  email_taken: 'Эта почта уже зарегистрирована. Попробуйте войти',
  bad_credentials: 'Неверная почта или пароль',
  too_many_attempts: 'Слишком много попыток. Подождите немного и повторите',
  unauthorized: 'Нужно войти заново',
  forbidden: 'Нет доступа',
  bad_code: 'Неверный или устаревший код',
  code_cooldown: 'Код уже отправлен. Подождите минуту',
  telegram_not_linked: 'Этот Telegram не привязан. Войдите по почте и привяжите его в личном кабинете',
  telegram_unavailable: 'Вход через Telegram сейчас недоступен. Попробуйте позже',
  telegram_other: 'Этот аккаунт привязан к другому Telegram. Откройте его из того Telegram или войдите по почте в браузере',
  telegram_taken: 'Этот Telegram уже привязан к другому аккаунту',
  telegram_linked: 'Telegram уже привязан к этому аккаунту',
  telegram_only: 'В этот аккаунт можно войти только через Telegram. Сначала добавьте почту и пароль',
  has_email: 'У аккаунта уже есть почта',
  bad_init_data: 'Telegram не подтвердил вход. Закройте приложение и откройте снова',
  bad_text: 'Напишите сообщение, до 2000 символов',
  feedback_unavailable: 'Сообщение сейчас не отправить. Попробуйте позже',
  mail_unavailable: 'Письма пока не отправляются. Попробуйте позже',
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

export const currentUser = (token: string) => call(`auth/me?v=${APP_VERSION}`, { method: 'GET', token }) as Promise<Pick<Session, 'user'>>;

export const sendVerifyCode = (token: string) => call('auth/verify/send', { method: 'POST', token, body: {} });

export const verifyEmail = (token: string, code: string) => call('auth/verify', { method: 'POST', token, body: { code } });

export const requestPasswordReset = (email: string) => call('auth/reset/request', { method: 'POST', body: { email } });

export const confirmPasswordReset = (email: string, code: string, newPassword: string) => call('auth/reset', { method: 'POST', body: { email, code, newPassword } });

export interface TelegramCheck {
  status: 'pending' | 'confirmed' | 'linked';
  token?: string;
  user?: Session['user'];
}

export const telegramLogin = () => call('auth/telegram/start', { method: 'POST', body: {} }) as Promise<{ code: string; url: string }>;

export const telegramLink = (token: string) => call('auth/telegram/link', { method: 'POST', token, body: {} }) as Promise<{ code: string; url: string }>;

export const telegramCheck = (code: string) => call('auth/telegram/check', { method: 'POST', body: { code, device: deviceLabel() } }) as Promise<TelegramCheck>;

export const telegramWebapp = (initData: string, create: boolean, token?: string) =>
  call('auth/telegram/webapp', { method: 'POST', body: { initData, device: 'Telegram', create }, ...(token ? { token } : {}) }) as Promise<{ status: 'same' | 'session' | 'unlinked'; token?: string; user?: Session['user'] }>;

export const telegramWebappLink = (token: string, initData: string) => call('auth/telegram/webapp-link', { method: 'POST', token, body: { initData } }) as Promise<Pick<Session, 'user'>>;

export const addEmail = (token: string, email: string, password: string) => call('auth/email', { method: 'POST', token, body: { email, password } }) as Promise<Pick<Session, 'user'>>;

export const telegramUnlink = (token: string) => call('auth/telegram', { method: 'DELETE', token });

export const telegramReminders = (token: string, on: boolean) => call('auth/telegram/reminders', { method: 'POST', token, body: { on } });

export const sendFeedback = (token: string, text: string) => call('feedback', { method: 'POST', token, body: { text, version: APP_VERSION } });

export const logoutAccount = (token: string) => call('auth/logout', { method: 'POST', token });

export const changePassword = (token: string, oldPassword: string, newPassword: string) =>
  call('auth/password', { method: 'POST', token, body: { oldPassword, newPassword } });

export const adminStats = <T>(token: string) => call('admin/stats', { method: 'GET', token }) as Promise<T>;

export const deleteAccount = (token: string, password: string | null) => call('auth/account', { method: 'DELETE', token, body: password === null ? { confirm: true } : { password } });
