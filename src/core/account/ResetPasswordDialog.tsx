import { useState, type SyntheticEvent } from 'react';
import { Button, Modal, TextInput, rowClass, toast } from '../ui';
import { requestReset, resetPassword } from '../auth/store';

/** Восстановление пароля: код приходит на почту и вводится здесь же, поэтому из приложения на iPhone уходить не нужно. */
export function ResetPasswordDialog({ email: initial, onClose, onDone }: { email: string; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState(initial);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось');
    } finally {
      setBusy(false);
    }
  };

  const send = () =>
    run(async () => {
      await requestReset(email);
      setSent(true);
    });

  const submit = (e: SyntheticEvent) => {
    e.preventDefault();
    void (sent
      ? run(async () => {
          await resetPassword(email, code, password);
          toast('Пароль изменён, вы вошли в аккаунт', 'check', 'var(--c-habit)');
          onDone();
        })
      : send());
  };

  return (
    <Modal keepOnOutsideClick open onClose={onClose} title="Восстановить пароль" accent="var(--c-habit)">
      <form onSubmit={submit}>
        <TextInput label="Почта" type="email" autoComplete="email" inputMode="email" autoCapitalize="off" autoCorrect="off" spellCheck={false} required readOnly={sent} value={email} onChange={(e) => setEmail(e.target.value)} />
        {sent && (
          <>
            <p style={{ marginTop: 0 }}>Если такой аккаунт есть, мы отправили на почту код. Он действует 15 минут. Проверьте и папку «Спам».</p>
            <TextInput label="Код из письма" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} data-autofocus />
            <TextInput label="Новый пароль (не короче 8 символов)" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </>
        )}
        {error && (
          <p role="alert" style={{ color: 'var(--c-warn)', margin: '8px 0' }}>
            {error}
          </p>
        )}
        <div className={rowClass} style={{ marginTop: 12 }}>
          <Button type="submit" variant="habit" disabled={busy}>
            {busy ? 'Подождите…' : sent ? 'Сменить пароль' : 'Получить код'}
          </Button>
          {sent && (
            <Button variant="ghost" disabled={busy} onClick={() => void send()}>
              Отправить ещё раз
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
