/* Первое открытие внутри Telegram: начать с новым аккаунтом или войти в свой по почте (тогда этот Telegram к нему привяжется). */
import { useState } from 'react';
import { useAuth, startTelegramAccount } from '../auth/store';
import { AuthModal } from '../account/AuthModal';
import { Button, Modal, toast } from '../ui';

export function TelegramWelcome() {
  const open = useAuth((s) => s.telegramWelcome);
  const [email, setEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;
  const close = () => useAuth.setState({ telegramWelcome: false });
  if (email) return <AuthModal mode="login" onClose={() => setEmail(false)} />;

  const start = () => {
    setBusy(true);
    setError(null);
    startTelegramAccount()
      .then(() => toast('Готово! Данные сохраняются, напоминания пришлёт бот', 'check', 'var(--c-habit)'))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Не получилось'))
      .finally(() => setBusy(false));
  };

  return (
    <Modal keepOnOutsideClick open onClose={close} title="PIXEL PLANNER" accent="var(--c-habit)" footer={
      <>
        <Button onClick={() => setEmail(true)}>Есть аккаунт с почтой</Button>
        <Button variant="habit" disabled={busy} onClick={start}>
          {busy ? 'Подождите…' : 'Начать'}
        </Button>
      </>
    }>
      <p style={{ marginTop: 0 }}>Задачи, привычки, тренировки, питание и финансы в одном месте. Аккаунт создастся по вашему Telegram, без почты и пароля.</p>
      <p style={{ marginBottom: 0, color: 'var(--c-text-dim)' }}>Уже пользуетесь приложением в браузере? Войдите по почте, и этот Telegram привяжется к вашему аккаунту.</p>
      {error && (
        <p role="alert" style={{ color: 'var(--c-warn)', marginBottom: 0 }}>
          {error}
        </p>
      )}
    </Modal>
  );
}
