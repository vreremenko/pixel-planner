import { useState, type SyntheticEvent } from 'react';
import { Button, Modal, Panel, TextInput, rowClass, toast } from '../../ui';
import { changePassword, logout, removeAccount, useAuth } from '../../auth/store';
import { syncNow, useSync } from '../../sync/manager';
import { AuthModal } from './AuthModal';

const fmt = (t: number) => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fail = (e: unknown) => toast(e instanceof Error ? e.message : 'Что-то пошло не так', 'alert', 'var(--c-warn)');

type Dialog = 'login' | 'register' | 'logout' | 'password' | 'delete' | null;

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
    <Modal open onClose={onClose} title={isDelete ? 'Удалить аккаунт?' : 'Сменить пароль'} accent={isDelete ? 'var(--c-warn)' : 'var(--c-habit)'}>
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

export function AccountPanel() {
  const session = useAuth((s) => s.session);
  const sync = useSync((s) => s.state);
  // Фоновые проходы идут каждые несколько секунд, поэтому о ходе синхронизации говорим только после нажатия кнопки
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);

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
    <Panel title="Аккаунт" icon="heart" accent="var(--c-habit)">
      {session ? (
        <>
          <p style={{ marginTop: 0 }}>
            Вы вошли как <b>{session.user.email}</b>. Задачи, привычки и награды сохраняются на сервере и доступны на всех устройствах, где вы вошли.
          </p>
          <p className="digits" style={{ margin: '0 0 12px', minHeight: '2.6em', color: sync?.lastError ? 'var(--c-warn)' : 'var(--c-text-dim)' }}>
            {busy
              ? 'Синхронизируем…'
              : sync?.lastError
                ? `Не удалось: ${sync.lastError}${sync.lastAt ? ` (последний успех ${fmt(sync.lastAt)})` : ''}`
                : sync?.lastAt
                  ? `Последняя синхронизация: ${fmt(sync.lastAt)}`
                  : 'Ещё не синхронизировались'}
          </p>
          <div className={rowClass}>
            <Button variant="habit" icon="repeat" disabled={busy}
              onClick={() => {
                setBusy(true);
                void syncNow().finally(() => setBusy(false));
              }}
            >
              Синхронизировать
            </Button>
            <Button onClick={() => setDialog('logout')}>Выйти</Button>
          </div>
          <div className={rowClass} style={{ marginTop: 12 }}>
            <Button small variant="ghost" icon="lock" onClick={() => setDialog('password')}>
              Сменить пароль
            </Button>
            <Button small variant="ghost" icon="trash" onClick={() => setDialog('delete')}>
              Удалить аккаунт
            </Button>
          </div>
        </>
      ) : (
        <>
          <p style={{ marginTop: 0 }}>
            Без аккаунта всё хранится только на этом устройстве. Войдите, и данные будут сохраняться на сервере: их можно открыть на телефоне и на компьютере, а напоминания будут приходить даже при закрытом приложении.
          </p>
          <div className={rowClass}>
            <Button variant="habit" icon="check" onClick={() => setDialog('login')}>
              Войти
            </Button>
            <Button onClick={() => setDialog('register')}>Создать аккаунт</Button>
          </div>
        </>
      )}
      <p style={{ marginBottom: 0, color: 'var(--c-text-dim)', fontSize: 17 }}>На сервере данные хранятся без шифрования. Пароль мы не видим и сохранить не можем.</p>

      {(dialog === 'login' || dialog === 'register') && <AuthModal mode={dialog} onClose={() => setDialog(null)} />}
      {(dialog === 'password' || dialog === 'delete') && <PasswordDialog kind={dialog} onClose={() => setDialog(null)} />}
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
