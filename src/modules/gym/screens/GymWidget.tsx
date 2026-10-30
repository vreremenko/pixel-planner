/* Карточка «Тренировки» на сводке. */
import { useNavigate } from 'react-router';
import { Button } from '../../../core/ui';
import { usePrograms, useWorkouts } from '../data/hooks';
import { nextProgram } from '../domain/logic';
import { startWorkout } from '../services/workouts';
import s from './Gym.module.css';

export function GymWidget() {
  const navigate = useNavigate();
  const programs = usePrograms();
  const workouts = useWorkouts();
  if (!programs || !workouts) return null;
  const active = workouts.find((w) => !w.finishedAt);
  const last = workouts.find((w) => w.finishedAt);
  const next = nextProgram(programs, workouts);
  return (
    <>
      {active ? (
        <>
          <p style={{ marginTop: 0 }}>Идёт: {active.title}</p>
          <Button variant="primary" small icon="right" onClick={() => void navigate(`/gym/workout/${active.id}`)}>
            Продолжить
          </Button>
        </>
      ) : (
        <>
          <p style={{ marginTop: 0 }}>{next ? `Сегодня по программе: ${next.name}` : 'Программы пока нет — можно начать свободную тренировку.'}</p>
          <Button small icon="right" onClick={() => void startWorkout(next).then((id) => navigate(`/gym/workout/${id}`))}>
            Начать
          </Button>
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
