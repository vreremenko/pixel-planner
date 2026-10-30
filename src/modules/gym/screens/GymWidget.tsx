/* Карточка «Тренировки» на сводке: идущая тренировка, что сегодня по расписанию или «сегодня тренировок нет». */
import { useNavigate } from 'react-router';
import { Button } from '../../../core/ui';
import { useToday } from '../../../core/shell/useToday';
import { usePrograms, useWorkouts } from '../data/hooks';
import { scheduleFor } from '../domain/logic';
import { startWorkout } from '../services/workouts';
import s from './Gym.module.css';

export function GymWidget() {
  const navigate = useNavigate();
  const todayDate = useToday();
  const programs = usePrograms();
  const workouts = useWorkouts();
  if (!programs || !workouts) return null;
  const active = workouts.find((w) => !w.finishedAt);
  const last = workouts.find((w) => w.finishedAt);
  const { due: today, done } = scheduleFor(programs, workouts, todayDate);
  const doneToday = done.length > 0 || workouts.some((w) => w.finishedAt && w.date === todayDate);
  return (
    <>
      {active ? (
        <>
          <p style={{ marginTop: 0 }}>Идёт: {active.title}</p>
          <Button variant="primary" small icon="right" onClick={() => void navigate(`/gym/workout/${active.id}`)}>
            Продолжить
          </Button>
        </>
      ) : today.length === 0 ? (
        <p style={{ margin: 0 }}>{done.length ? `Сегодня сделано: ${done.map((p) => p.name).join(', ')} ✓` : doneToday ? 'Тренировка на сегодня сделана.' : 'Сегодня тренировок нет.'}</p>
      ) : (
        <>
          <p style={{ marginTop: 0 }}>
            Сегодня: {today.map((p) => p.name).join(', ')}
            {done.length > 0 && <span className={s.dim}> · сделано: {done.map((p) => p.name).join(', ')}</span>}
          </p>
          <div className={s.row} style={{ flexWrap: 'wrap', minHeight: 0 }}>
            {today.map((p) => (
              <Button key={p.id} small icon="right" onClick={() => void startWorkout(p).then((id) => navigate(`/gym/workout/${id}`))}>
                {today.length > 1 ? p.name : 'Начать'}
              </Button>
            ))}
          </div>
        </>
      )}
      {last && (
        <p className={s.hint} style={{ marginBottom: 0, marginTop: 12 }}>
          Последняя: {last.title}, {new Date(last.startedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
        </p>
      )}
    </>
  );
}
