/* Mini App: Telegram передаёт приложению данные пользователя с подписью. Проверяем её сами по токену бота, без запросов к Telegram. */
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Данные старше этого не принимаем: перехваченная строка не должна работать вечно. */
const MAX_AGE_MS = 86_400_000;

export interface WebAppUser {
  id: string;
  username?: string;
}

/** Пользователь или причина отказа (пишется в журнал сервера). */
export function checkInitData(initData: string, botToken: string, now: number): WebAppUser | string {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return 'нет подписи';
  params.delete('hash');
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(check).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return 'подпись не сошлась';
  const authDate = Number(params.get('auth_date')) * 1000;
  if (!Number.isFinite(authDate) || now - authDate > MAX_AGE_MS) return 'данные устарели';
  try {
    const user = JSON.parse(params.get('user') ?? '') as { id?: unknown; username?: unknown };
    if (typeof user.id !== 'number') return 'нет пользователя';
    return { id: String(user.id), ...(typeof user.username === 'string' ? { username: user.username } : {}) };
  } catch {
    return 'нет пользователя';
  }
}

/** Аккаунт, созданный из Telegram, получает служебный адрес: на домен .invalid письма никогда не уходят. */
export const telegramEmail = (telegramId: string): string => `tg${telegramId}@telegram.invalid`;
export const isTelegramOnly = (email: string): boolean => email.endsWith('@telegram.invalid');
