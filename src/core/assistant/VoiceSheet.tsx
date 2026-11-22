/*
 * Шторка помощника: говорите (или пишите) — нейросеть предлагает действия, вы снимаете галочки с ошибочных
 * и нажимаете «Применить». До этого ничего не записывается: сервер лишь «примеряет» действия на копии данных.
 */
import { markAssistantTried } from '../onboarding/assistantTried';
import { UndoButton } from './UndoButton';
import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { Button, inputClass, toast, useScrollLock } from '../ui';
import { useAuth } from '../auth/store';
import { assistantApply, assistantPlan, AuthError, type AssistantPlan } from '../auth/api';
import { syncNow } from '../sync/manager';
import { useVoice } from './useVoice';
import { ShieldIcon, type ShieldTone } from './ShieldMic';
import s from './Assistant.module.css';

type Stage = 'recording' | 'thinking' | 'review' | 'applying' | 'done';

export function VoiceSheet({ onClose }: { onClose: () => void }) {
  const token = useAuth((st) => st.session?.token);
  const navigate = useNavigate();
  useScrollLock();
  const [stage, setStage] = useState<Stage>('recording');
  const [micError, setMicError] = useState('');
  const [plan, setPlan] = useState<AssistantPlan | null>(null);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [results, setResults] = useState<{ ok: boolean; text: string }[]>([]);
  const [undo, setUndo] = useState<string | null>(null);
  const [typed, setTyped] = useState('');

  const fail = (e: unknown) => {
    toast(e instanceof AuthError ? e.message : 'Не получилось. Попробуйте ещё раз', 'alert', 'var(--c-warn)');
    setStage('review');
  };

  const send = (input: { text: string } | { audio: string }) => {
    if (!token) return;
    setStage('thinking');
    markAssistantTried();
    assistantPlan(token, input).then((p) => {
      setPlan(p);
      // По умолчанию отмечено всё: снимают только ошибочное
      setChecked(p.proposals.map(() => true));
      setStage('review');
    }, fail);
  };

  const voice = useVoice({
    onAudio: (audio) => {
      if (audio) send({ audio });
      else {
        setMicError('Ничего не записалось. Скажите ещё раз или напишите текстом.');
        setStage('review');
      }
    },
    onError: () => {
      setMicError('Нет доступа к микрофону. Напишите команду текстом или разрешите микрофон в настройках.');
      setStage('review');
    },
  });

  const listen = () => {
    setPlan(null);
    setMicError('');
    setStage('recording');
    voice.start();
  };

  // Открыли шторку — сразу слушаем
  const { start } = voice;
  useEffect(() => {
    if (token) start();
  }, [token, start]);

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
      setUndo(r.undo ?? null);
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
        voice.cancel();
        setTyped('');
        send({ text: t });
      }}
    >
      <input className={inputClass} value={typed} maxLength={1000} placeholder="Или напишите текстом" aria-label="Команда текстом" onChange={(e) => setTyped(e.target.value)} />
      <Button type="submit" icon="right" label="Отправить" />
    </form>
  );

  const selected = checked.filter(Boolean).length;
  const tone: ShieldTone = voice.phase === 'live' ? 'live' : voice.phase === 'quiet' && voice.heard ? 'wait' : 'idle';
  return (
    <div className={s.backdrop} onClick={(e) => e.target === e.currentTarget && stage !== 'applying' && onClose()}>
      <div className={s.sheet} role="dialog" aria-modal="true" aria-label="Помощник" data-scroll-lock-allow>
        <div className={s.sheetTop}>
          <div className={s.grip} />
          {stage !== 'applying' && <Button small variant="ghost" icon="close" label="Закрыть помощника" className={s.sheetClose} onClick={onClose} />}
        </div>
        {!token ? (
          <>
            <p className={s.status}>Помощник</p>
            <p>Чтобы управлять приложением голосом, войдите в аккаунт: команды разбирает нейросеть на сервере.</p>
            <div className={s.row}>
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
            {/* Щит сам показывает, что происходит: горит, пока говорите; замолчали — пульсирует, нажмите — отправлю */}
            <button
              type="button"
              className={s.bigShield}
              data-tone={tone}
              style={{ '--lvl': String(voice.phase === 'live' ? voice.level : 0) } as CSSProperties}
              onClick={voice.finish}
              aria-label="Отправить сказанное"
            >
              <ShieldIcon size={125} tone={tone} />
            </button>
            <p className={s.listenHint} aria-live="polite">
              {voice.phase === 'starting' ? 'Включаю микрофон…' : voice.phase === 'live' ? 'Слушаю…' : voice.heard ? 'Нажмите на щит — отправлю' : 'Говорите, я слушаю'}
            </p>
            {!voice.heard && <p className={s.example}>«потратил 320 на кофе и напомни завтра в 10 купить молоко»</p>}
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
            {plan && plan.proposals.length > 0 ? (
              <div className={s.row}>
                <Button variant="primary" onClick={apply}>
                  {selected ? `Применить (${String(selected)})` : 'Ничего не записывать'}
                </Button>
              </div>
            ) : (
              <>
                <div className={s.row}>
                  <Button onClick={listen}>Сказать ещё раз</Button>
                </div>
                {typeRow}
              </>
            )}
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
              <Button onClick={listen}>Ещё команда</Button>
              {undo && token && <UndoButton token={token} undo={undo} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
