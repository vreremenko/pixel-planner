import { useEffect, useState } from 'react';
import { Button, Modal, toast } from '../ui';
import { checkTelegram, startTelegram, type TelegramLink } from '../auth/store';

const POLL_MS = 2000;

/**
 * Вход и привязка через бота: приложение получает ссылку, человек подтверждает кнопкой в Telegram, приложение узнаёт об этом само.
 * Ссылка запрашивается заранее: открыть окно на iPhone можно только прямо из нажатия.
 */
export function TelegramDialog({ mode, onClose, onDone }: { mode: 'login' | 'link'; onClose: () => void; onDone: () => void }) {
  const [link, setLink] = useState<TelegramLink | null>(null);
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : 'Не получилось');

  useEffect(() => {
    let live = true;
    startTelegram(mode).then(
      (l) => {
        if (live) setLink(l);
      },
      (e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : 'Не получилось');
      },
    );
    return () => {
      live = false;
    };
  }, [mode]);

  useEffect(() => {
    if (!opened || !link || error) return;
    let busy = false;
    const timer = setInterval(() => {
      if (busy) return;
      busy = true;
      checkTelegram(link.code)
        .then((done) => {
          if (!done) return;
          clearInterval(timer);
          toast(mode === 'login' ? 'Вы вошли в аккаунт' : 'Telegram привязан', 'check', 'var(--c-habit)');
          onDone();
        })
        .catch((e: unknown) => {
          clearInterval(timer);
          setError(e instanceof Error ? e.message : 'Не получилось');
        })
        .finally(() => {
          busy = false;
        });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [opened, link, error, mode, onDone]);

  const open = () => {
    if (!link) return;
    try {
      window.open(link.url, '_blank', 'noreferrer');
      setOpened(true);
    } catch (e) {
      fail(e);
    }
  };

  return (
    <Modal keepOnOutsideClick open onClose={onClose} title={mode === 'login' ? 'Вход через Telegram' : 'Привязать Telegram'} accent="var(--c-habit)">
      {error ? (
        <p role="alert" style={{ color: 'var(--c-warn)', marginTop: 0 }}>
          {error}
        </p>
      ) : opened ? (
        <p style={{ marginTop: 0 }}>В Telegram нажмите «Запустить», а потом кнопку подтверждения. Затем вернитесь сюда, приложение подхватит всё само.</p>
      ) : (
        <p style={{ marginTop: 0 }}>{mode === 'login' ? 'Сработает, если Telegram уже привязан к аккаунту в личном кабинете.' : 'После этого можно будет входить в приложение через Telegram.'}</p>
      )}
      {!error && (
        <Button variant="habit" disabled={!link} onClick={open}>
          {link ? (opened ? 'Открыть ещё раз' : 'Открыть Telegram') : 'Подождите…'}
        </Button>
      )}
    </Modal>
  );
}
