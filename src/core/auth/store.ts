/* Состояние входа в приложении и действия с аккаунтом. */
import { create } from 'zustand';
import { metaRepo } from '../data/repo';
import { disablePush, resendSchedule } from '../notifications/push';
import { attachAccount, detachAccount, forgetOwner } from '../sync/manager';
import { inTelegram, telegramInitData } from '../telegram/webapp';
import { toast } from '../ui/toastStore';
import * as api from './api';
import { clearSession, loadSession, onSessionChange, saveSession, type Session } from './session';

interface AuthState {
  /** null — не вошли; undefined — ещё не прочитали. */
  session: Session | null | undefined;
  /** Внутри Telegram открыли впервые: этот Telegram ни к какому аккаунту не привязан. */
  telegramWelcome: boolean;
}

export const useAuth = create<AuthState>(() => ({ session: undefined, telegramWelcome: false }));

/** Прочитать сохранённый вход и следить за его изменениями (вход, выход, отзыв сессии сервером). */
export function startAuth(): () => void {
  const off = onSessionChange((session) => useAuth.setState({ session }));
  void loadSession().then((session) => {
    useAuth.setState({ session });
    if (inTelegram()) void syncTelegram(session);
    else if (session) void refreshRole(session);
  });
  return off;
}

const tgError = (e: unknown) => toast(`Telegram: ${e instanceof Error ? e.message : 'ошибка'}`, 'alert', 'var(--c-warn)');

/**
 * Внутри Telegram приложение всегда в аккаунте этого Telegram: так нельзя сидеть в чужом аккаунте.
 * Вошли в другой — переключаемся (данные того аккаунта стираются только с этого устройства, на сервере они целы).
 * Telegram ни к чему не привязан — предлагаем начать или войти по почте.
 */
async function syncTelegram(session: Session | null): Promise<void> {
  const initData = telegramInitData();
  if (!initData) return;
  try {
    const res = await api.telegramWebapp(initData, false, session?.token);
    if (res.status === 'same' && session) {
      await refreshRole(session);
      return;
    }
    if (res.status === 'session' && res.token && res.user) {
      if (session) await logout(true);
      await enter({ token: res.token, user: res.user });
      return;
    }
    if (session) await linkThisTelegram().catch(async (e: unknown) => {
      await logout(true);
      tgError(e);
    });
    if (!(await loadSession())) useAuth.setState({ telegramWelcome: true });
  } catch (e) {
    tgError(e);
  }
}

/** Новый аккаунт для этого Telegram, без почты и пароля. */
export async function startTelegramAccount(): Promise<void> {
  const initData = telegramInitData();
  if (!initData) throw new api.AuthError('telegram_unavailable', 'Это работает только внутри Telegram');
  const res = await api.telegramWebapp(initData, true);
  if (!res.token || !res.user) throw new api.AuthError('error', 'Не удалось создать аккаунт');
  await enter({ token: res.token, user: res.user });
}

/** Привязать этот Telegram к аккаунту, в который вошли по почте внутри Telegram. */
async function linkThisTelegram(): Promise<void> {
  const initData = telegramInitData();
  if (!initData) return;
  const session = await currentSession();
  const { user } = await api.telegramWebappLink(session.token, initData);
  await saveSession({ ...session, user: { ...session.user, ...user } });
}

/** Сообщаем серверу версию приложения и сверяем роль: её могли поменять, а без связи работает сохранённая. */
async function refreshRole(session: Session): Promise<void> {
  const fresh = await api.currentUser(session.token).catch(() => null);
  if (!fresh || (Boolean(fresh.user.admin) === Boolean(session.user.admin) && fresh.user.emailVerified === session.user.emailVerified && Boolean(fresh.user.telegram) === Boolean(session.user.telegram) && Boolean(fresh.user.telegramReminders) === Boolean(session.user.telegramReminders) && Boolean(fresh.user.telegramOnly) === Boolean(session.user.telegramOnly))) return;
  const current = await loadSession();
  if (current?.token === session.token) await saveSession({ ...current, user: fresh.user });
}

async function enter(session: Session): Promise<void> {
  useAuth.setState({ telegramWelcome: false });
  await saveSession(session);
  await attachAccount(session);
  void refreshRole(session);
}

export async function register(email: string, password: string): Promise<void> {
  await enter(await api.registerAccount(email, password));
}

export async function login(email: string, password: string): Promise<void> {
  await enter(await api.loginAccount(email, password));
  if (!inTelegram()) return;
  // Вход по почте внутри Telegram привязывает этот Telegram; аккаунт другого Telegram здесь открыть нельзя
  try {
    await linkThisTelegram();
  } catch (e) {
    await logout(true);
    throw e;
  }
}

export const requestReset = async (email: string): Promise<void> => {
  await api.requestPasswordReset(email);
};

/** Новый пароль закрывает все сессии аккаунта, поэтому сразу входим с ним. */
export async function resetPassword(email: string, code: string, newPassword: string): Promise<void> {
  await api.confirmPasswordReset(email, code, newPassword);
  await login(email, newPassword);
}

export type TelegramLink = Awaited<ReturnType<typeof api.telegramLogin>>;

export const startTelegram = async (mode: 'login' | 'link'): Promise<TelegramLink> => (mode === 'login' ? api.telegramLogin() : api.telegramLink((await currentSession()).token));

/** true — подтверждено в боте: вход выполнен или Telegram привязан. */
export async function checkTelegram(code: string): Promise<boolean> {
  const { status, token, user } = await api.telegramCheck(code);
  if (status === 'pending' || !user) return false;
  if (token) await enter({ token, user });
  else await saveSession({ ...(await currentSession()), user });
  return true;
}

/** Аккаунт из Telegram получает почту и пароль: войти можно будет и без Telegram. */
export async function addEmail(email: string, password: string): Promise<void> {
  const session = await currentSession();
  const { user } = await api.addEmail(session.token, email, password);
  await saveSession({ ...session, user: { ...session.user, ...user, telegramOnly: false } });
}

export async function unlinkTelegram(): Promise<void> {
  const session = await currentSession();
  await api.telegramUnlink(session.token);
  await saveSession({ ...session, user: { ...session.user, telegram: false, telegramReminders: false } });
}

/** Дублировать напоминания в Telegram. Расписание отправляем заново, чтобы бот получил его сразу. */
export async function setTelegramReminders(on: boolean): Promise<void> {
  const session = await currentSession();
  await api.telegramReminders(session.token, on);
  await saveSession({ ...session, user: { ...session.user, telegramReminders: on } });
  resendSchedule();
}

export async function sendFeedback(text: string): Promise<void> {
  await api.sendFeedback((await currentSession()).token, text);
}

async function currentSession(): Promise<Session> {
  const session = await loadSession();
  if (!session) throw new api.AuthError('unauthorized', 'Нужно войти заново');
  return session;
}

export async function resendVerifyCode(): Promise<void> {
  await api.sendVerifyCode((await currentSession()).token);
}

export async function confirmEmail(code: string): Promise<void> {
  const session = await currentSession();
  await api.verifyEmail(session.token, code);
  await saveSession({ ...session, user: { ...session.user, emailVerified: true } });
}

/** Выйти. С eraseLocal данные стираются с этого устройства (для чужого или общего телефона). */
export async function logout(eraseLocal: boolean): Promise<void> {
  const session = await loadSession();
  // Push привязан к аккаунту: снимаем подписку, пока вход ещё действует
  await disablePush().catch(() => undefined);
  if (session) await api.logoutAccount(session.token).catch(() => undefined);
  await detachAccount(eraseLocal);
  await clearSession();
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  await api.changePassword((await currentSession()).token, oldPassword, newPassword);
}

/** Удалить аккаунт и данные на сервере. Данные на устройстве остаются. */
export async function removeAccount(password: string | null): Promise<void> {
  await api.deleteAccount((await currentSession()).token, password);
  // Подписки устройств сервер удалил вместе с аккаунтом
  const push = await metaRepo.get<{ deviceId: string; enabled: boolean }>('push');
  if (push) await metaRepo.set('push', { ...push, enabled: false });
  await forgetOwner();
  await clearSession();
}
