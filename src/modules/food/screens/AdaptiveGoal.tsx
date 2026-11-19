/* Невидимая часть раздела «Питание»: раз в день проверяет, не пора ли подстроить норму калорий под вес. */
import { useEffect } from 'react';
import { toast } from '../../../core/ui';
import { useToday } from '../../../core/shell/useToday';
import { onCursorChange } from '../../../core/sync/manager';
import { runAdaptive } from '../services/adaptive';

export function AdaptiveGoal() {
  const today = useToday();
  useEffect(() => {
    let done = false;
    const check = () => {
      if (done) return;
      void runAdaptive(today).then((r) => {
        if (!r) return;
        done = true;
        toast(r.note, 'apple', 'var(--c-food)');
      });
    };
    // Чуть позже запуска (данные успеют подтянуться) и после каждой синхронизации — пока не сработает сегодня
    const t = setTimeout(check, 5_000);
    const off = onCursorChange(check);
    return () => {
      clearTimeout(t);
      off();
    };
  }, [today]);
  return null;
}
