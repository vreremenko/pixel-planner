/* Плашка таймера отдыха поверх любого экрана: отсчёт, ±15 с, пропустить. */
import { useEffect, useState } from 'react';
import { Button } from '../../../core/ui';
import { useRestTimer } from '../restTimer';
import s from './Gym.module.css';

export function RestTimerBar() {
  const { endsAt, add, stop } = useRestTimer();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);
  if (endsAt === null) return null;
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  return (
    <div className={s.timer} role="timer" aria-live="off" aria-label={`Отдых: осталось ${String(left)} секунд`}>
      <span className={`${s.dim} ${s.timerLabel}`}>Отдых</span>
      <span className={s.timerTime}>
        {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
      </span>
      <Button small onClick={() => add(-15)}>
        −15
      </Button>
      <Button small onClick={() => add(15)}>
        +15
      </Button>
      <Button small variant="ghost" icon="close" label="Пропустить отдых" onClick={stop} />
    </div>
  );
}
