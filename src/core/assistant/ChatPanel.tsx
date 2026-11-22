/*
 * Помощник на компьютере: панель-чат справа. Обычно пишут (поле ввода сразу в фокусе), но можно и голосом —
 * кнопка микрофона рядом. Каждая команда — сообщение: что нейросеть предлагает сделать (галочки, по умолчанию все)
 * и «Применить»; до этого ничего не записывается. История — до закрытия панели.
 */
import { UndoButton } from './UndoButton';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { Button, inputClass, PixelIcon } from '../ui';
import { useAuth } from '../auth/store';
import { assistantApply, assistantPlan, AuthError, type AssistantPlan } from '../auth/api';
import { syncNow } from '../sync/manager';
import { useVoice } from './useVoice';
import { ShieldIcon } from './ShieldMic';
import s from './Assistant.module.css';

interface Turn {
  id: number;
  /** Что сказали или написали; для голосового — то, что распознано. */
  said: string;
  status: 'thinking' | 'review' | 'applying' | 'done' | 'failed';
  plan?: AssistantPlan;
  checked: boolean[];
  results?: { ok: boolean; text: string }[];
  /** Токен «Отменить» от сервера; нет — отменять нечего. */
  undo?: string | null;
  error?: string;
}

let nextId = 1;

export function ChatPanel({ onClose }: { onClose: () => void }) {
  const token = useAuth((st) => st.session?.token);
  const navigate = useNavigate();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [micError, setMicError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const patch = (id: number, p: Partial<Turn>) => setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)));

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [turns]);
  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const send = (payload: { text: string } | { audio: string }, said: string) => {
    if (!token) return;
    const id = nextId++;
    setTurns((ts) => [...ts, { id, said, status: 'thinking', checked: [] }]);
    assistantPlan(token, payload).then(
      (plan) => patch(id, { status: 'review', plan, said: plan.heard || said, checked: plan.proposals.map(() => true) }),
      (e: unknown) => patch(id, { status: 'failed', error: e instanceof AuthError ? e.message : 'Не получилось. Попробуйте ещё раз' }),
    );
  };

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    send({ text: t }, t);
  };

  // Голос: нажали микрофон — слушаем; замолчали — пульсирует (нажмите, чтобы отправить), долго тихо — отправляем сами
  const voice = useVoice({
    onAudio: (audio) => {
      if (audio) send({ audio }, '🎤 …');
    },
    onError: () => setMicError('Нет доступа к микрофону — разрешите его в настройках браузера.'),
  });
  const recording = voice.phase !== 'off';
  const toggleMic = () => {
    if (recording) voice.finish();
    else {
      setMicError('');
      voice.start();
    }
  };

  const apply = (t: Turn) => {
    if (!token || !t.plan) return;
    const calls = t.plan.proposals.filter((_, i) => t.checked[i]).map(({ name, args }) => ({ name, args }));
    if (!calls.length) {
      patch(t.id, { status: 'done', results: [] });
      return;
    }
    patch(t.id, { status: 'applying' });
    assistantApply(token, calls).then(
      (r) => {
        patch(t.id, { status: 'done', results: r.results, undo: r.undo ?? null });
        void syncNow();
      },
      (e: unknown) => patch(t.id, { status: 'review', error: e instanceof AuthError ? e.message : 'Не получилось записать' }),
    );
  };

  return (
    <aside className={s.chat} role="dialog" aria-label="Помощник">
      <header className={s.chatHead}>
        <ShieldIcon size={50} />
        <span className={s.grow}>Помощник</span>
        <Button small variant="ghost" icon="close" label="Закрыть помощника" onClick={onClose} />
      </header>
      <div className={s.chatBody}>
        {!token ? (
          <div className={s.bubble}>
            <p style={{ marginTop: 0 }}>Чтобы управлять приложением командами, войдите в аккаунт: их разбирает нейросеть на сервере.</p>
            <Button
              variant="primary"
              onClick={() => {
                onClose();
                void navigate('/account');
              }}
            >
              Войти
            </Button>
          </div>
        ) : turns.length === 0 ? (
          <div className={s.bubble}>
            Напишите или скажите, что сделать. Например:
            <br />— потратил 320 на кофе и 500 на такси
            <br />— напомни завтра в 10 купить молоко
            <br />— съел на обед 200 г гречки
            <br />— что у меня сегодня?
            <p style={{ marginBottom: 0, color: 'var(--c-text-dim)' }}>Перед записью покажу, что собираюсь сделать — лишнее можно снять.</p>
          </div>
        ) : (
          turns.map((t) => (
            <div key={t.id}>
              <div className={s.mine}>{t.said}</div>
              <div className={s.bubble}>
                {t.status === 'thinking' && <span className={s.dim}>Думаю… (бесплатная нейросеть, до полуминуты)</span>}
                {t.status === 'failed' && <span className={s.bad}>{t.error}</span>}
                {(t.status === 'review' || t.status === 'applying') && t.plan && (
                  <>
                    {t.plan.proposals.length > 0 && (
                      <ul className={s.items}>
                        {t.plan.proposals.map((p, i) => (
                          <li key={i}>
                            <label className={`${s.item} ${t.checked[i] ? '' : s.off}`}>
                              <input type="checkbox" disabled={t.status === 'applying'} checked={t.checked[i] ?? false} onChange={(e) => patch(t.id, { checked: t.checked.map((x, j) => (j === i ? e.target.checked : x)) })} />
                              <span>{p.preview}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                    {t.plan.answer && <p style={{ whiteSpace: 'pre-line', marginTop: 0 }}>{t.plan.answer}</p>}
                    {(t.plan.error || t.error) && <p className={s.bad}>{t.error ?? t.plan.error}</p>}
                    {t.plan.proposals.length > 0 && (
                      <div className={s.row}>
                        <Button small onClick={() => patch(t.id, { status: 'done', results: [] })}>
                          Отмена
                        </Button>
                        <Button small variant="primary" disabled={t.status === 'applying'} onClick={() => apply(t)}>
                          {t.status === 'applying' ? 'Записываю…' : `Применить (${String(t.checked.filter(Boolean).length)})`}
                        </Button>
                      </div>
                    )}
                  </>
                )}
                {t.status === 'done' &&
                  (t.results?.length ? (
                    <ul className={s.items} style={{ margin: 0 }}>
                      {t.results.map((r, i) => (
                        <li key={i} className={`${s.result} ${r.ok ? s.ok : s.bad}`}>
                          <span aria-hidden="true">{r.ok ? '✓' : '✗'}</span>
                          <span>{r.ok ? r.text : `Не получилось: ${r.text}`}</span>
                        </li>
                      ))}
                      {t.undo && token && (
                        <li>
                          <UndoButton token={token} undo={t.undo} />
                        </li>
                      )}
                    </ul>
                  ) : (
                    <span className={s.dim}>Ничего не записано.</span>
                  ))}
              </div>
            </div>
          ))
        )}
        <div ref={bottom} />
      </div>
      {token && (
        <form
          className={s.chatInput}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {micError && <p className={s.bad} style={{ margin: '0 0 6px' }}>{micError}</p>}
          <div className={s.typeRow} style={{ marginTop: 0 }}>
            <input ref={input} className={inputClass} value={text} maxLength={1000} placeholder={!recording ? 'Напишите команду' : voice.phase === 'live' ? 'Слушаю…' : voice.heard ? 'Нажмите микрофон — отправлю' : 'Говорите, я слушаю'} aria-label="Команда" onChange={(e) => setText(e.target.value)} disabled={recording} />
            <button
              type="button"
              className={`${s.micBtn} ${voice.phase === 'live' ? s.micOn : recording ? s.micWait : ''}`}
              style={{ '--lvl': String(voice.level) } as CSSProperties}
              onClick={toggleMic}
              aria-label={recording ? 'Отправить сказанное' : 'Сказать голосом'}
              aria-pressed={recording}
              title={recording ? 'Отправить' : 'Сказать голосом'}
            >
              <PixelIcon name="mic" size={28} />
            </button>
            <Button type="submit" icon="right" label="Отправить" disabled={recording} />
          </div>
        </form>
      )}
    </aside>
  );
}
