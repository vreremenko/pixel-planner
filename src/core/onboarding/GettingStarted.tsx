/*
 * «Начало работы» на «Сводке»: несколько первых шагов по выбранным при знакомстве разделам.
 * Пункт отмечается сам, когда появилась соответствующая запись. Всё сделано или «Скрыть» — карточка пропадает.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router';
import { useAuth } from '../auth/store';
import { db } from '../data/db';
import { metaRepo } from '../data/repo';
import { Button, Panel, PixelIcon, cx } from '../ui';
import { AREAS_KEY, GETTING_STARTED_HIDDEN, type Area } from '../../modules/starter';
import { triedAssistant } from './assistantTried';
import s from './GettingStarted.module.css';

const alive = (table: string) =>
  db
    .table(table)
    .filter((r: { deletedAt?: number }) => !r.deletedAt)
    .count();

interface Step {
  key: string;
  label: string;
  to: string;
  done: boolean;
}

export function GettingStarted() {
  const signedIn = useAuth((st) => Boolean(st.session));
  const state = useLiveQuery(async () => {
    const [areas, hidden] = await Promise.all([
      metaRepo.get<Area[]>(AREAS_KEY),
      metaRepo.get<boolean>(GETTING_STARTED_HIDDEN),
    ]);
    if (!areas || hidden) return null;
    const [tasks, series, logs, workouts, food, tx] = await Promise.all(
      ['tasks', 'series', 'habitLogs', 'gym_workouts', 'food_entries', 'fin_tx'].map(alive),
    );
    return {
      areas,
      tasks: (tasks ?? 0) + (series ?? 0),
      logs: logs ?? 0,
      workouts: workouts ?? 0,
      food: food ?? 0,
      tx: tx ?? 0,
    };
  });
  if (!state) return null;

  const steps: Step[] = [];
  if (state.areas.includes('planner')) {
    steps.push({
      key: 'task',
      label: 'Добавьте задачу на сегодня',
      to: '/day',
      done: state.tasks > 0,
    });
    steps.push({ key: 'habit', label: 'Отметьте привычку', to: '/habits', done: state.logs > 0 });
  }
  if (state.areas.includes('gym'))
    steps.push({
      key: 'gym',
      label: 'Проведите первую тренировку',
      to: '/gym',
      done: state.workouts > 0,
    });
  if (state.areas.includes('food'))
    steps.push({
      key: 'food',
      label: 'Посчитайте норму и запишите еду',
      to: '/food',
      done: state.food > 0,
    });
  if (state.areas.includes('finance'))
    steps.push({ key: 'fin', label: 'Запишите первую трату', to: '/finance', done: state.tx > 0 });
  steps.push(
    signedIn
      ? {
          key: 'ai',
          label: 'Скажите что-нибудь помощнику — щит внизу',
          to: '/',
          done: triedAssistant(),
        }
      : {
          key: 'login',
          label: 'Войдите: данные на всех устройствах, помощник, напоминания в Telegram',
          to: '/account',
          done: false,
        },
  );
  const left = steps.filter((x) => !x.done).length;
  if (left === 0) return null;

  return (
    <Panel
      title="Начало работы"
      icon="flag"
      accent="var(--c-gold)"
      actions={
        <Button
          small
          variant="ghost"
          onClick={() => void metaRepo.set(GETTING_STARTED_HIDDEN, true)}
        >
          Скрыть
        </Button>
      }
    >
      <p className={s.progress}>
        Сделано {steps.length - left} из {steps.length}
      </p>
      <ul className={s.list}>
        {steps.map((x) => (
          <li key={x.key}>
            <Link to={x.to} className={cx(s.item, x.done && s.done)}>
              <span className={s.mark} aria-hidden="true">
                {x.done ? <PixelIcon name="check" size={16} /> : null}
              </span>
              <span className={s.grow}>{x.label}</span>
              {!x.done && <PixelIcon name="right" size={16} />}
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
