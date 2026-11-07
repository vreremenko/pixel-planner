import { useCallback, useState, type SyntheticEvent } from 'react';
import { Button, ConfirmDialog, Modal, Panel, TextInput, rowClass, toast } from '../ui';
import { addEmail, changePassword, logout, removeAccount, startTelegramAccount, unlinkTelegram, useAuth } from '../auth/store';
import { inTelegram } from '../telegram/webapp';
import { AuthModal } from './AuthModal';
import { TelegramDialog } from './TelegramDialog';
import { VerifyEmailDialog } from './VerifyEmailDialog';

const fail = (e: unknown) => toast(e instanceof Error ? e.message : 'Что-то пошло не так', 'alert', 'var(--c-warn)');

type Dialog = 'login' | 'register' | 'logout' | 'password' | 'delete' | 'verify' | 'telegram' | 'email' | null;

/** Диалог с одним полем пароля (подтверждение удаления) или двумя (смена пароля). */
function PasswordDialog({ kind, onClose }: { kind: 'password' | 'delete'; onClose: () => void }) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isDelete = kind === 'delete';

  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isDelete) {
        await removeAccount(oldPassword);
        toast('Аккаунт удалён. Данные остались на этом устройстве', 'trash', 'var(--c-habit)');
      } else {
        await changePassword(oldPassword, newPassword);
        toast('Пароль изменён. На других устройствах нужно войти заново', 'check', 'var(--c-habit)');
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal keepOnOutsideClick open onClose={onClose} title={isDelete ? 'Удалить аккаунт?' : 'Сменить пароль'} accent={isDelete ? 'var(--c-warn)' : 'var(--c-habit)'}>
      <form onSubmit={(e) => void submit(e)}>
        {isDelete && <p style={{ marginTop: 0 }}>Все ваши данные на сервере будут стёрты без возможности восстановления. На этом устройстве задачи и привычки останутся. Введите пароль для подтверждения.</p>}
        <TextInput label={isDelete ? 'Пароль' : 'Текущий пароль'} type="password" autoComplete="current-password" required value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} data-autofocus />
        {!isDelete && <TextInput label="Новый пароль (не короче 8 символов)" type="password" autoComplete="new-password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />}
        {error && (
          <p role="alert" style={{ color: 'var(--c-warn)', margin: '8px 0' }}>
            {error}
          </p>
        )}
        <div className={rowClass} style={{ marginTop: 12 }}>
          <Button type="submit" variant={isDelete ? 'danger' : 'habit'} disabled={busy}>
            {busy ? 'Подождите…' : isDelete ? 'Удалить навсегда' : 'Сменить пароль'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Аккаунт из Telegram получает почту и пароль, чтобы входить и без Telegram. */
function EmailDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await addEmail(email, password);
      toast('Почта добавлена. Код для подтверждения отправлен на неё', 'check', 'var(--c-habit)');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal keepOnOutsideClick open onClose={onClose} title="Почта и пароль" accent="var(--c-habit)">
      <form onSubmit={(e) => void submit(e)}>
        <p style={{ marginTop: 0 }}>С ними можно войти и без Telegram: на компьютере или в браузере.</p>
        <TextInput label="Почта" type="email" autoComplete="email" inputMode="email" autoCapitalize="off" autoCorrect="off" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)} data-autofocus />
        <TextInput label="Пароль (не короче 8 символов)" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && (
          <p role="alert" style={{ color: 'var(--c-warn)', margin: '8px 0' }}>
            {error}
          </p>
        )}
        <div className={rowClass} style={{ marginTop: 12 }}>
          <Button type="submit" variant="habit" disabled={busy}>
            {busy ? 'Подождите…' : 'Сохранить'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function AccountPanel() {
  const session = useAuth((s) => s.session);
  const [dialog, setDialog] = useState<Dialog>(null);
  const closeDialog = useCallback(() => setDialog(null), []);
  const tgOnly = session?.user.telegramOnly === true;
  // Внутри Telegram аккаунт всегда того Telegram: выходить и отвязывать там нечего
  const tg = inTelegram();

  const doLogout = async (erase: boolean) => {
    setDialog(null);
    try {
      await logout(erase);
      toast(erase ? 'Вы вышли, данные стёрты с этого устройства' : 'Вы вышли из аккаунта', 'check', 'var(--c-habit)');
    } catch (e) {
      fail(e);
    }
  };

  return (
    <Panel title="Аккаунт" icon="user" accent="var(--c-habit)">
      {session ? (
        <>
          <p style={{ marginTop: 0 }}>
            {tgOnly ? 'Вы вошли через Telegram.' : (
              <>
                Вы вошли как <b>{session.user.email}</b>.
              </>
            )}{' '}
            Задачи и привычки сохраняются на сервере и доступны на всех устройствах, где вы вошли.
          </p>
          {!tgOnly && session.user.emailVerified === false && (
            <>
              <p style={{ color: 'var(--c-warn)' }}>Почта не подтверждена.</p>
              <div className={rowClass} style={{ marginBottom: 12 }}>
                <Button variant="habit" icon="check" onClick={() => setDialog('verify')}>
                  Подтвердить почту
                </Button>
              </div>
            </>
          )}
          <div className={rowClass}>
            {!tg && (
              <Button icon="left" onClick={() => setDialog('logout')}>
                Выйти
              </Button>
            )}
            {tgOnly ? (
              <Button icon="lock" onClick={() => setDialog('email')}>
                Добавить почту и пароль
              </Button>
            ) : (
              <Button icon="lock" onClick={() => setDialog('password')}>
                Сменить пароль
              </Button>
            )}
            <Button icon="trash" onClick={() => setDialog('delete')}>
              Удалить аккаунт
            </Button>
          </div>
          {!tgOnly && !tg && (
            <>
              <p style={{ marginBottom: 8 }}>{session.user.telegram ? 'Telegram привязан, через него можно входить.' : 'Привяжите Telegram, чтобы входить через него.'}</p>
              <div className={rowClass}>
                {session.user.telegram ? (
                  <Button onClick={() => void unlinkTelegram().catch(fail)}>Отвязать Telegram</Button>
                ) : (
                  <Button onClick={() => setDialog('telegram')}>Привязать Telegram</Button>
                )}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <p style={{ marginTop: 0 }}>
            Без аккаунта всё хранится только на этом устройстве. Войдите, и данные будут сохраняться на сервере: их можно открыть на телефоне и на компьютере, а напоминания будут приходить даже при закрытом приложении.
          </p>
          <div className={rowClass}>
            {tg ? (
              <>
                <Button variant="habit" icon="check" onClick={() => void startTelegramAccount().catch(fail)}>
                  Начать с Telegram
                </Button>
                <Button onClick={() => setDialog('login')}>Есть аккаунт с почтой</Button>
              </>
            ) : (
              <>
                <Button variant="habit" icon="check" onClick={() => setDialog('login')}>
                  Войти
                </Button>
                <Button onClick={() => setDialog('register')}>Создать аккаунт</Button>
              </>
            )}
          </div>
        </>
      )}
      <p style={{ marginBottom: 0, color: 'var(--c-text-dim)', fontSize: 17 }}>На сервере данные хранятся без шифрования. Пароль мы не видим и сохранить не можем.</p>

      {(dialog === 'login' || dialog === 'register') && <AuthModal mode={dialog} onClose={() => setDialog(null)} />}
      {dialog === 'telegram' && <TelegramDialog mode="link" onClose={closeDialog} onDone={closeDialog} />}
      {dialog === 'verify' && session && <VerifyEmailDialog email={session.user.email} onClose={() => setDialog(null)} />}
      {dialog === 'email' && <EmailDialog onClose={closeDialog} />}
      {(dialog === 'password' || (dialog === 'delete' && !tgOnly)) && <PasswordDialog kind={dialog} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog === 'delete' && tgOnly}
        title="Удалить аккаунт?"
        action="Удалить навсегда"
        onClose={closeDialog}
        onConfirm={() =>
          void removeAccount(null)
            .then(() => toast('Аккаунт удалён. Данные остались на этом устройстве', 'trash', 'var(--c-habit)'))
            .catch(fail)
        }
      >
        Все ваши данные на сервере будут стёрты без возможности восстановления.
      </ConfirmDialog>
      <Modal
        open={dialog === 'logout'}
        onClose={() => setDialog(null)}
        title="Выйти из аккаунта?"
        accent="var(--c-warn)"
        footer={
          <>
            <Button onClick={() => setDialog(null)}>Отмена</Button>
            <Button onClick={() => void doLogout(false)}>Выйти</Button>
            <Button variant="danger" onClick={() => void doLogout(true)}>
              Выйти и стереть данные здесь
            </Button>
          </>
        }
      >
        <p style={{ marginTop: 0 }}>Ваши данные сохранены на сервере, при следующем входе они вернутся. Если телефон или компьютер чужой или общий, стирайте данные при выходе.</p>
        <p style={{ marginBottom: 0, color: 'var(--c-text-dim)' }}>Push-напоминания при закрытом приложении после выхода перестанут приходить.</p>
      </Modal>
    </Panel>
  );
}
