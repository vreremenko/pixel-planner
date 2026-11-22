/*
 * «Разрешить доступ»: сюда сервер присылает человека, когда нейросеть (ChatGPT, claude.ai…) просит подключиться
 * через OAuth. Вход — обычный вход приложения; после ответа возвращаем человека обратно к нейросети.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AuthError, oauthApprove, oauthRequest } from '../auth/api';
import { useAuth } from '../auth/store';
import { Button, Panel, rowClass } from '../ui';
import { AccountPanel } from './AccountPanel';

type Info = { client: string; redirectHost: string };

/**
 * Куда уйдёт доступ, решает адрес возврата, а не название: название клиент присылает сам и может назваться
 * «ChatGPT». Поэтому главное на экране — домен, а для незнакомых доменов — предупреждение.
 */
const KNOWN = ['claude.ai', 'claude.com', 'anthropic.com', 'chatgpt.com', 'openai.com', 'cursor.com', 'cursor.sh', 'localhost', '127.0.0.1'];
const isKnown = (host: string) => KNOWN.some((k) => host === k || host.endsWith(`.${k}`) || host.startsWith(`${k}:`));
/** Страницу встроили в чужой сайт (кликджекинг) — разрешать доступ отсюда нельзя. */
const framed = (() => {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
})();

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
      (e: unknown) => {
        setBusy(false);
        setError(e instanceof AuthError && e.message ? e.message : 'Запрос устарел. Вернитесь в нейросеть и подключите PIXEL PLANNER заново.');
      },
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-4)' }}>
      <h1 className="glow pageTitle" style={{ color: 'var(--c-habit)' }}>
        Подключение нейросети
      </h1>
      {framed ? (
        <Panel title="Откройте отдельно" icon="alert" accent="var(--c-warn)">
          <p style={{ margin: 0 }}>Эта страница открыта внутри другого сайта. Разрешать доступ отсюда небезопасно — откройте ссылку в отдельной вкладке.</p>
        </Panel>
      ) : !id ? (
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
        <Panel title="Разрешить доступ?" icon="lock" accent={isKnown(info.redirectHost) ? 'var(--c-habit)' : 'var(--c-warn)'}>
          <p style={{ marginTop: 0, marginBottom: 4 }}>Доступ получит сайт</p>
          <p style={{ marginTop: 0, fontSize: '1.4em', fontWeight: 700, overflowWrap: 'anywhere', color: isKnown(info.redirectHost) ? 'var(--c-habit)' : 'var(--c-warn)' }}>{info.redirectHost}</p>
          <p style={{ overflowWrap: 'anywhere' }}>
            Называет себя «{info.client}» — это название он прислал сам. Аккаунт: <b>{session.user.email.endsWith('@telegram.invalid') ? 'из Telegram' : session.user.email}</b>
          </p>
          {!isKnown(info.redirectHost) && (
            <p style={{ color: 'var(--c-warn)' }}>
              ⚠ Это не адрес известной нейросети (claude.ai, chatgpt.com, Cursor). Если вы не подключали этот сайт сами только что — нажмите «Отказать»: так могут украсть доступ к вашим данным.
            </p>
          )}
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
