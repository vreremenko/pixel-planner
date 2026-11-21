/*
 * Шторка помощника: говорите (или пишите) — нейросеть предлагает действия, вы снимаете галочки с ошибочных
 * и нажимаете «Применить». До этого ничего не записывается: сервер лишь «примеряет» действия на копии данных.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, inputClass, toast, useScrollLock } from '../ui';
import { useAuth } from '../auth/store';
import { assistantApply, assistantPlan, AuthError, type AssistantPlan } from '../auth/api';
import { syncNow } from '../sync/manager';
import { startRecording, type Recording } from './recorder';
import { ShieldIcon } from './ShieldMic';
import s from './Assistant.module.css';

type Stage = 'recording' | 'thinking' | 'review' | 'applying' | 'done';
const BARS = 14;

export function VoiceSheet({ onClose }: { onClose: () => void }) {
  const token = useAuth((st) => st.session?.token);
  const navigate = useNavigate();
  useScrollLock();
  const [stage, setStage] = useState<Stage>('recording');
  const [levels, setLevels] = useState<number[]>(() => Array<number>(BARS).fill(0.05));
  const [micError, setMicError] = useState('');
  const [plan, setPlan] = useState<AssistantPlan | null>(null);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [results, setResults] = useState<{ ok: boolean; text: string }[]>([]);
  const [typed, setTyped] = useState('');
  const rec = useRef<Recording | null>(null);

  const fail = (e: unknown) => {
    toast(e instanceof AuthError ? e.message : 'Не получилось. Попробуйте ещё раз', 'alert', 'var(--c-warn)');
    setStage('review');
  };

  const send = (input: { text: string } | { audio: string }) => {
    if (!token) return;
    setStage('thinking');
    assistantPlan(token, input).then((p) => {
      setPlan(p);
      // По умолчанию отмечено всё: снимают только ошибочное
      setChecked(p.proposals.map(() => true));
      setStage('review');
    }, fail);
  };

  const stopAndSend = () => {
    const r = rec.current;
    rec.current = null;
    if (!r) return;
    void r.stop().then((audio) => {
      if (audio) send({ audio });
      else {
        setMicError('Ничего не записалось. Скажите ещё раз или напишите текстом.');
        setStage('review');
      }
    });
  };

  // Открыли шторку — сразу слушаем
  useEffect(() => {
    if (!token) return;
    let alive = true;
    startRecording(
      (level) => {
        setLevels((xs) => [...xs.slice(1), Math.max(0.05, level)]);
      },
      () => {
        stopAndSend();
      },
    ).then(
      (r) => {
        if (alive) rec.current = r;
        else r.cancel();
      },
      () => {
        if (!alive) return;
        setMicError('Нет доступа к микрофону. Напишите команду текстом или разрешите микрофон в настройках.');
        setStage('review');
      },
    );
    return () => {
      alive = false;
      rec.current?.cancel();
      rec.current = null;
    };
    // Запись запускается один раз при открытии
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const apply = () => {
    if (!token || !plan) return;
    const calls = plan.proposals.filter((_, i) => checked[i]).map(({ name, args }) => ({ name, args }));
    if (calls.length === 0) {
      onClose();
      return;
    }
    setStage('applying');
    assistantApply(token, calls).then((r) => {
      setResults(r.results);
      setStage('done');
      // Записи сделал сервер — забираем их сразу, чтобы они появились на экране
      void syncNow();
    }, fail);
  };

  const typeRow = (
    <form
      className={s.typeRow}
      onSubmit={(e) => {
        e.preventDefault();
        const t = typed.trim();
        if (!t) return;
        rec.current?.cancel();
        rec.current = null;
        setTyped('');
        send({ text: t });
      }}
    >
      <input className={inputClass} value={typed} maxLength={1000} placeholder="Или напишите: потратил 450 на такси" aria-label="Команда текстом" onChange={(e) => setTyped(e.target.value)} />
      <Button type="submit" icon="right" label="Отправить" />
    </form>
  );

  const selected = checked.filter(Boolean).length;
  return (
    <div className={s.backdrop} onClick={(e) => e.target === e.currentTarget && stage !== 'applying' && onClose()}>
      <div className={s.sheet} role="dialog" aria-modal="true" aria-label="Помощник">
        <div className={s.sheetTop}>
          <div className={s.grip} />
          {stage !== 'applying' && <Button small variant="ghost" icon="close" label="Закрыть помощника" className={s.sheetClose} onClick={onClose} />}
        </div>
        {!token ? (
          <>
            <p className={s.status}>Помощник</p>
            <p>Чтобы управлять приложением голосом, войдите в аккаунт: команды разбирает нейросеть на сервере.</p>
            <div className={s.row}>
              <Button onClick={onClose}>Закрыть</Button>
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
          </>
        ) : stage === 'recording' ? (
          <>
            <div className={s.listenHead}>
              <ShieldIcon size={36} recording />
              <p className={s.status} style={{ margin: 0 }}>
                Слушаю… скажите и нажмите «Готово»
              </p>
            </div>
            <div className={s.wave} aria-hidden="true">
              {levels.map((l, i) => (
                <span key={i} style={{ height: `${String(Math.round(l * 100))}%` }} />
              ))}
            </div>
            <p style={{ color: 'var(--c-text-dim)', marginTop: 0 }}>Например: «потратил 320 на кофе и напомни завтра в 10 купить молоко»</p>
            <div className={s.row}>
              <Button onClick={onClose}>Отмена</Button>
              <Button variant="primary" icon="check" onClick={stopAndSend}>
                Готово
              </Button>
            </div>
            {typeRow}
          </>
        ) : stage === 'thinking' || stage === 'applying' ? (
          <>
            <p className={s.status}>{stage === 'thinking' ? 'Думаю… (бесплатная нейросеть, до полуминуты)' : 'Записываю…'}</p>
            {plan?.heard && stage === 'applying' && <p className={s.heard}>«{plan.heard}»</p>}
          </>
        ) : stage === 'review' ? (
          <>
            {plan?.heard && <p className={s.heard}>«{plan.heard}»</p>}
            {micError && !plan && <p style={{ color: 'var(--c-warn)' }}>{micError}</p>}
            {plan && plan.proposals.length > 0 && (
              <>
                <p className={s.status}>Что сделать</p>
                <ul className={s.items}>
                  {plan.proposals.map((p, i) => (
                    <li key={i}>
                      <label className={`${s.item} ${checked[i] ? '' : s.off}`}>
                        <input type="checkbox" checked={checked[i] ?? false} onChange={(e) => setChecked((xs) => xs.map((x, j) => (j === i ? e.target.checked : x)))} />
                        <span>{p.preview}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {plan?.answer && <p style={{ whiteSpace: 'pre-line' }}>{plan.answer}</p>}
            {plan?.error && <p style={{ color: 'var(--c-warn)' }}>{plan.error}</p>}
            <div className={s.row}>
              <Button onClick={onClose}>{plan?.proposals.length ? 'Отмена' : 'Закрыть'}</Button>
              {plan && plan.proposals.length > 0 && (
                <Button variant="primary" onClick={apply}>
                  {selected ? `Применить (${String(selected)})` : 'Ничего не записывать'}
                </Button>
              )}
            </div>
            {(!plan || plan.proposals.length === 0) && typeRow}
          </>
        ) : (
          <>
            <p className={s.status}>Готово</p>
            <ul className={s.items}>
              {results.map((r, i) => (
                <li key={i} className={`${s.result} ${r.ok ? s.ok : s.bad}`}>
                  <span aria-hidden="true">{r.ok ? '✓' : '✗'}</span>
                  <span>{r.ok ? r.text : `Не получилось: ${r.text}`}</span>
                </li>
              ))}
            </ul>
            <div className={s.row}>
              <Button variant="primary" onClick={onClose}>
                Хорошо
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
