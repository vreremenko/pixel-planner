/* Главная раздела: идущая тренировка, следующая по программе, дни программы, история. */
import { Link, useNavigate } from 'react-router';
import { Button, Panel, PixelIcon } from '../../../core/ui';
import { usePrograms, useWorkouts } from '../data/hooks';
import { daysLabel, scheduleFor } from '../domain/logic';
import { useToday } from '../../../core/shell/useToday';
import type { Program } from '../domain/types';
import { startWorkout } from '../services/workouts';
import s from './Gym.module.css';

const dateLabel = (t: number) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', weekday: 'short' });

export function GymHome() {
  const navigate = useNavigate();
  const todayDate = useToday();
  const programs = usePrograms();
  const workouts = useWorkouts();
  if (!programs || !workouts) return null;
  const active = workouts.find((w) => !w.finishedAt);
  const { due: today, done } = scheduleFor(programs, workouts, todayDate);
  const others = programs.filter((p) => !today.includes(p));
  const start = (p?: Program) => void startWorkout(p).then((id) => navigate(`/gym/workout/${id}`));
  const history = workouts.filter((w) => w.finishedAt).slice(0, 10);

  return (
    <>
      <div className={s.head}>
        <h1 className="glow pageTitle" style={{ color: 'var(--c-gym)' }}>
          Тренировка
        </h1>
      </div>
      <div className={s.stack}>
        {active ? (
          <Panel title="Идёт тренировка" icon="dumbbell" accent="var(--c-gym)">
            <p style={{ marginTop: 0 }}>
              {active.title} · начата {new Date(active.startedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
            </p>
            <Button variant="primary" icon="right" onClick={() => void navigate(`/gym/workout/${active.id}`)}>
              Продолжить
            </Button>
          </Panel>
        ) : (
          <Panel title="Начать" icon="dumbbell" accent="var(--c-gym)">
            <p style={{ marginTop: 0 }}>
              {today.length ? `Сегодня по расписанию: ${today.map((p) => p.name).join(', ')}` : done.length ? 'На сегодня всё по расписанию сделано.' : 'Сегодня тренировок по расписанию нет.'}
              {done.length > 0 && (
                <>
                  <br />
                  <span className={s.hint}>Сделано сегодня: {done.map((p) => p.name).join(', ')} ✓</span>
                </>
              )}
            </p>
            <div className={s.row} style={{ flexWrap: 'wrap' }}>
              {today.map((p) => (
                <Button key={p.id} variant="primary" icon="right" onClick={() => start(p)}>
                  {p.name}
                </Button>
              ))}
              <Button icon="plus" onClick={() => start()}>
                Пустая тренировка
              </Button>
            </div>
            {others.length > 0 && (
              <>
                <p className={s.hint} style={{ marginTop: 12 }}>
                  Другие дни программы:
                </p>
                <div className={s.row} style={{ flexWrap: 'wrap' }}>
                  {others.map((p) => (
                    <Button key={p.id} small onClick={() => start(p)}>
                      {p.name} · {daysLabel(p.days)}
                    </Button>
                  ))}
                </div>
              </>
            )}
            {programs.length === 0 && (
              <p className={s.hint} style={{ marginBottom: 0 }}>
                Составьте <Link to="/gym/programs">программу</Link> и назначьте дни недели — тогда здесь и на «Сводке» появится тренировка на сегодня.
              </p>
            )}
          </Panel>
        )}
        <Panel title="История" icon="book" accent="var(--c-gym)">
          {history.length === 0 ? (
            <p className={s.dim} style={{ margin: 0 }}>
              Здесь появятся завершённые тренировки.
            </p>
          ) : (
            <ul className={s.list}>
              {history.map((w) => (
                <li key={w.id}>
                  <Link className={`${s.row} ${s.link}`} to={`/gym/workout/${w.id}`}>
                    <span className={s.grow}>{w.title}</span>
                    <span className={s.dim}>{dateLabel(w.startedAt)}</span>
                    <PixelIcon name="right" size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
