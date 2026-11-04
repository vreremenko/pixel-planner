/* Закрывает забытую тренировку: пока приложение открыто — раз в минуту, а после долгого перерыва — при открытии. */
import { useEffect } from 'react';
import { autoFinishIdle } from '../services/workouts';
import { useRestTimer } from '../restTimer';

export function AutoFinish() {
  const stopRest = useRestTimer((t) => t.stop);
  useEffect(() => {
    const check = () => void autoFinishIdle().then((w) => w && stopRest());
    // Первую проверку откладываем: пусть сначала придут подходы с других устройств
    const first = setTimeout(check, 15_000);
    const id = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [stopRest]);
  return null;
}
