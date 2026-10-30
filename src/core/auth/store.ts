/* Состояние входа в приложении и действия с аккаунтом. */
import { create } from 'zustand';
import { metaRepo } from '../data/repo';
import { disablePush } from '../notifications/push';
import { attachAccount, detachAccount, forgetOwner } from '../sync/manager';
import * as api from './api';
import { clearSession, loadSession, onSessionChange, saveSession, type Session } from './session';

interface AuthState {
  /** null — не вошли; undefined — ещё не прочитали. */
  session: Session | null | undefined;
}

export const useAuth = create<AuthState>(() => ({ session: undefined }));

/** Прочитать сохранённый вход и следить за его изменениями (вход, выход, отзыв сессии сервером). */
export function startAuth(): () => void {
  const off = onSessionChange((session) => useAuth.setState({ session }));
  void loadSession().then((session) => useAuth.setState({ session }));
  return off;
}

async function enter(session: Session): Promise<void> {
  await saveSession(session);
  await attachAccount(session);
}

export async function register(email: string, password: string): Promise<void> {
  await enter(await api.registerAccount(email, password));
}

export async function login(email: string, password: string): Promise<void> {
  await enter(await api.loginAccount(email, password));
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
  const session = await loadSession();
  if (!session) throw new api.AuthError('unauthorized', 'Нужно войти заново');
  await api.changePassword(session.token, oldPassword, newPassword);
}

/** Удалить аккаунт и данные на сервере. Данные на устройстве остаются. */
export async function removeAccount(password: string): Promise<void> {
  const session = await loadSession();
  if (!session) throw new api.AuthError('unauthorized', 'Нужно войти заново');
  await api.deleteAccount(session.token, password);
  // Подписки устройств сервер удалил вместе с аккаунтом
  const push = await metaRepo.get<{ deviceId: string; enabled: boolean }>('push');
  if (push) await metaRepo.set('push', { ...push, enabled: false });
  await forgetOwner();
  await clearSession();
}
