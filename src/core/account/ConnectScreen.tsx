/*
 * «Разрешить доступ»: сюда сервер присылает человека, когда нейросеть (ChatGPT, claude.ai…) просит подключиться
 * через OAuth. Вход — обычный вход приложения; после ответа возвращаем человека обратно к нейросети.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { oauthApprove, oauthRequest } from '../auth/api';
import { useAuth } from '../auth/store';
import { Button, Panel, rowClass } from '../ui';
import { AccountPanel } from './AccountPanel';

type Info = { client: string; redirectHost: string };

export function ConnectScreen() {
  const [params] = useSearchParams();
  const id = params.get('r') ?? '';
  const session = useAuth((s) => s.session);
  const token = session?.token;
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token || !id) return;
    let live = true;
    oauthRequest(token, id).then(
      (r) => {
        if (live) setInfo(r);
      },
      () => {
        if (live) setError('Запрос устарел. Вернитесь в нейросеть и подключите PIXEL PLANNER заново.');
      },
    );
    return () => {
      live = false;
    };
  }, [token, id]);

  const answer = (allow: boolean) => {
    if (!token) return;
    setBusy(true);
    oauthApprove(token, id, allow).then(
      (r) => {
        window.location.href = r.redirect;
      },
      () => {
        setBusy(false);
        setError('Запрос устарел. Вернитесь в нейросеть и подключите PIXEL PLANNER заново.');
      },
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-4)' }}>
      <h1 className="glow pageTitle" style={{ color: 'var(--c-habit)' }}>
        Подключение нейросети
      </h1>
      {!id ? (
        <Panel title="Нет запроса" icon="alert" accent="var(--c-warn)">
          <p style={{ margin: 0 }}>Эта страница открывается сама, когда нейросеть просит доступ к PIXEL PLANNER.</p>
        </Panel>
      ) : session === undefined ? null : !session ? (
        <>
          <Panel title="Сначала войдите" icon="lock" accent="var(--c-gold)">
            <p style={{ margin: 0 }}>Нейросеть просит доступ к вашему ежедневнику. Войдите в аккаунт PIXEL PLANNER — после входа здесь появится вопрос, разрешить ли доступ.</p>
          </Panel>
          <AccountPanel />
        </>
      ) : error ? (
        <Panel title="Не получилось" icon="alert" accent="var(--c-warn)">
          <p style={{ margin: 0 }}>{error}</p>
        </Panel>
      ) : !info ? (
        <p>Загружаем запрос…</p>
      ) : (
        <Panel title={`Разрешить доступ: ${info.client}?`} icon="lock" accent="var(--c-habit)">
          <p style={{ marginTop: 0, overflowWrap: 'anywhere' }}>
            <b>{info.client}</b> ({info.redirectHost}) просит доступ к аккаунту <b>{session.user.email.endsWith('@telegram.invalid') ? 'из Telegram' : session.user.email}</b>
          </p>
          <p>Нейросеть сможет:</p>
          <ul>
            <li>читать задачи, привычки, финансы и питание;</li>
            <li>добавлять, править и удалять записи — только когда вы её об этом попросите.</li>
          </ul>
          <p>Менять пароль, почту и удалять аккаунт она не сможет. Отключить её можно в любой момент: «Личный кабинет» → «Нейросети».</p>
          <div className={rowClass}>
            <Button variant="habit" icon="check" disabled={busy} onClick={() => answer(true)}>
              Разрешить
            </Button>
            <Button disabled={busy} onClick={() => answer(false)}>
              Отказать
            </Button>
          </div>
        </Panel>
      )}
    </div>
  );
}
