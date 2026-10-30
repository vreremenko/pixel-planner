import { useState, type SyntheticEvent } from 'react';
import { Button, Modal, TextInput, toast } from '../../ui';
import { login, register } from '../../auth/store';

type Mode = 'login' | 'register';

/** Окно входа и регистрации. */
export function AuthModal({ mode: initial, onClose }: { mode: Mode; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>(initial);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isRegister = mode === 'register';

  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await (isRegister ? register(email, password) : login(email, password));
      toast(isRegister ? 'Аккаунт создан. Данные теперь сохраняются на сервере' : 'Вы вошли в аккаунт', 'check', 'var(--c-habit)');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={isRegister ? 'Создать аккаунт' : 'Вход в аккаунт'} accent="var(--c-habit)">
      <form onSubmit={(e) => void submit(e)}>
        <TextInput label="Почта" type="email" autoComplete="email" inputMode="email" autoCapitalize="off" autoCorrect="off" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)} data-autofocus={email === '' ? true : undefined} />
        <TextInput
          label={isRegister ? 'Пароль (не короче 8 символов)' : 'Пароль'}
          type="password"
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          required
          minLength={isRegister ? 8 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p role="alert" style={{ color: 'var(--c-warn)', margin: '8px 0' }}>
            {error}
          </p>
        )}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
          <Button type="submit" variant="habit" icon="check" disabled={busy}>
            {busy ? 'Подождите…' : isRegister ? 'Создать аккаунт' : 'Войти'}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setMode(isRegister ? 'login' : 'register');
              setError(null);
            }}
          >
            {isRegister ? 'Уже есть аккаунт' : 'Создать аккаунт'}
          </Button>
        </div>
        {isRegister && <p style={{ color: 'var(--c-text-dim)', marginBottom: 0 }}>Данные, которые уже есть на этом устройстве, перейдут в новый аккаунт.</p>}
      </form>
    </Modal>
  );
}
