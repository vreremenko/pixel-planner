/*
 * Первое знакомство: три коротких шага при первом запуске на новом устройстве без данных.
 * 1) что хотите вести; 2) готовые наборы (привычки, программа, сколько на карте); 3) что дальше.
 * Любой шаг можно пропустить — тогда просто пустое приложение, как раньше.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/store';
import { hasUserData, metaRepo } from '../data/repo';
import { usePulled } from '../sync/manager';
import { ToggleRow } from '../settings/ToggleRow';
import { Button, Field, Modal, PixelIcon, Segmented, TextInput, cx, toast } from '../ui';
import { fs } from '../ui/fs';
import {
  AREAS,
  AREAS_KEY,
  ONBOARDED_KEY,
  STARTER_HABITS,
  STARTER_PROGRAMS,
  applyStarter,
  type Area,
} from '../../modules/starter';
import s from './Onboarding.module.css';

/** Показывать ли: ещё не знакомились, данных нет, и (если вошли) данные с сервера уже подтянулись. */
function useNeedsOnboarding(): [boolean, () => void] {
  const session = useAuth((st) => st.session);
  const telegramWelcome = useAuth((st) => st.telegramWelcome);
  const pulled = usePulled();
  const [need, setNeed] = useState(false);
  useEffect(() => {
    if (session === undefined || telegramWelcome || (session && !pulled)) return;
    const run = { cancelled: false };
    void (async () => {
      if (await metaRepo.get<boolean>(ONBOARDED_KEY)) return;
      // Уже пользуются (данные есть) — знакомить поздно, просто запоминаем
      if (await hasUserData()) {
        await metaRepo.set(ONBOARDED_KEY, true);
        return;
      }
      if (!run.cancelled) setNeed(true);
    })().catch(() => undefined);
    return () => {
      run.cancelled = true;
    };
  }, [session, telegramWelcome, pulled]);
  return [need, () => setNeed(false)];
}

export function Onboarding() {
  const [need, done] = useNeedsOnboarding();
  const signedIn = useAuth((st) => Boolean(st.session));
  const [step, setStep] = useState(0);
  const [areas, setAreas] = useState<Area[]>(['planner']);
  const [habits, setHabits] = useState<string[]>(['water', 'exercise']);
  const [program, setProgram] = useState<string>('gym');
  const [money, setMoney] = useState('');
  const [busy, setBusy] = useState(false);
  if (!need) return null;

  const skip = () => {
    // Пропустили — «Начало работы» всё равно покажем, по всем разделам
    void metaRepo.set(
      AREAS_KEY,
      AREAS.map((a) => a.id),
    );
    void metaRepo.set(ONBOARDED_KEY, true);
    done();
  };
  const finish = async () => {
    setBusy(true);
    try {
      await applyStarter({
        areas,
        habits: areas.includes('planner') ? habits : [],
        program: areas.includes('gym') && program !== 'none' ? program : null,
        money: areas.includes('finance') ? money : '',
      });
      setStep(2);
    } catch {
      toast('Не получилось сохранить — можно настроить всё в разделах', 'alert', 'var(--c-warn)');
      skip();
    } finally {
      setBusy(false);
    }
  };
  const toggle = <T,>(list: T[], v: T, on: boolean) =>
    on ? [...list, v] : list.filter((x) => x !== v);

  const footer =
    step === 0 ? (
      <>
        <Button variant="ghost" onClick={skip}>
          Пропустить
        </Button>
        <span style={{ flex: 1 }} />
        <Button
          variant="gold"
          icon="right"
          disabled={areas.length === 0}
          onClick={() => setStep(1)}
        >
          Дальше
        </Button>
      </>
    ) : step === 1 ? (
      <>
        <Button variant="ghost" onClick={() => setStep(0)}>
          Назад
        </Button>
        <span style={{ flex: 1 }} />
        <Button variant="gold" icon="check" disabled={busy} onClick={() => void finish()}>
          Готово
        </Button>
      </>
    ) : (
      <Button variant="gold" icon="right" onClick={done}>
        Поехали
      </Button>
    );

  return (
    <Modal
      open
      keepOnOutsideClick
      onClose={skip}
      title={step === 2 ? 'Всё готово' : 'Добро пожаловать'}
      accent="var(--c-gold)"
      footer={footer}
    >
      <p className={s.steps} aria-label={`Шаг ${String(step + 1)} из 3`}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={cx(s.dot, i <= step && s.dotOn)} />
        ))}
      </p>
      {step === 0 && (
        <>
          <p style={{ marginTop: 0 }}>
            Задачи, привычки, тренировки, питание и деньги — в одном месте. Что хотите вести?
            Остальное никуда не денется, просто не будет мешать в начале.
          </p>
          <div className={s.areas} role="group" aria-label="Что хотите вести">
            {AREAS.map((a) => {
              const on = areas.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={on}
                  className={cx(s.area, on && s.areaOn)}
                  onClick={() => setAreas(toggle(areas, a.id, !on))}
                >
                  <PixelIcon name={a.icon} size={24} />
                  <span>
                    <b>{a.title}</b>
                    <br />
                    <span className={s.dim}>{a.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {step === 1 && (
        <>
          <p style={{ marginTop: 0 }}>
            Начнём не с пустого листа. Всё это обычные записи — потом поменяете или удалите.
          </p>
          {areas.includes('planner') && (
            <Field label="Привычки для начала">
              {STARTER_HABITS.map((h) => (
                <ToggleRow
                  key={h.key}
                  label={h.label}
                  checked={habits.includes(h.key)}
                  onChange={(v) => setHabits(toggle(habits, h.key, v))}
                  color="var(--c-habit)"
                />
              ))}
            </Field>
          )}
          {areas.includes('gym') && (
            <Field label="Программа тренировок (пн, ср, пт)">
              <Segmented
                label="Программа тренировок"
                value={program}
                onChange={setProgram}
                options={[
                  ...STARTER_PROGRAMS.map((p) => ({
                    value: p.key,
                    label: p.key === 'gym' ? 'В зале' : 'Дома',
                  })),
                  { value: 'none', label: 'Своя' },
                ]}
              />
              <p className={s.dim} style={{ margin: '6px 0 0', fontSize: fs(16) }}>
                {STARTER_PROGRAMS.find((p) => p.key === program)?.hint ??
                  'Составите сами в разделе «Тренировки».'}
              </p>
            </Field>
          )}
          {areas.includes('finance') && (
            <TextInput
              label="Сколько сейчас на карте, ₽ (можно потом)"
              inputMode="decimal"
              placeholder="например, 25 000"
              value={money}
              onChange={(e) => setMoney(e.target.value)}
            />
          )}
          {areas.includes('food') && (
            <p className={s.dim}>
              Норму калорий посчитаем в разделе «Питание»: рост, вес и цель — три вопроса.
            </p>
          )}
        </>
      )}
      {step === 2 && (
        <>
          <p style={{ marginTop: 0 }}>
            На «Сводке» появится список «Начало работы» — пара шагов, чтобы освоиться.
          </p>
          <div className={s.tip}>
            <PixelIcon name="shield" size={24} />
            <span>
              <b>Щит внизу — помощник.</b> Нажмите и скажите или напишите: «купить молоко завтра в
              10», «потратил 300 на кофе», «съел овсянку 200 г». Он покажет, что запишет, — вы
              подтверждаете.
            </span>
          </div>
          {!signedIn && (
            <p className={s.dim}>
              Пока всё хранится на этом устройстве. Помощнику, напоминаниям при закрытом приложении
              и синхронизации нужен аккаунт — войти можно в любой момент.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
