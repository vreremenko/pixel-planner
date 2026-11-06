import { useState, type SyntheticEvent } from 'react';
import { Button, Modal, TextInput, rowClass, toast } from '../ui';
import { confirmEmail, resendVerifyCode } from '../auth/store';

/** Подтверждение почты кодом из письма. */
export function VerifyEmailDialog({ email, onClose }: { email: string; onClose: () => void }) {
  const [code, setCode] = useState('');
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

  const submit = (e: SyntheticEvent) => {
    e.preventDefault();
    void run(async () => {
      await confirmEmail(code);
      toast('Почта подтверждена', 'check', 'var(--c-habit)');
      onClose();
    });
  };

  const resend = () =>
    run(async () => {
      await resendVerifyCode();
      toast('Код отправлен', 'check', 'var(--c-habit)');
    });

  return (
    <Modal keepOnOutsideClick open onClose={onClose} title="Подтвердить почту" accent="var(--c-habit)">
      <form onSubmit={submit}>
        <p style={{ marginTop: 0 }}>
          Нажмите «Отправить код», и мы пришлём его на <b>{email}</b>. Код действует 15 минут. Проверьте и папку «Спам».
        </p>
        <TextInput label="Код из письма" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} data-autofocus />
        {error && (
          <p role="alert" style={{ color: 'var(--c-warn)', margin: '8px 0' }}>
            {error}
          </p>
        )}
        <div className={rowClass} style={{ marginTop: 12 }}>
          <Button type="submit" variant="habit" disabled={busy}>
            {busy ? 'Подождите…' : 'Подтвердить'}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => void resend()}>
            Отправить код
          </Button>
        </div>
      </form>
    </Modal>
  );
}
