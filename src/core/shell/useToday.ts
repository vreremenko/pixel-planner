import { useEffect, useState } from 'react';
import { today } from '../domain/dates';

/** Текущая дата; обновляется в полночь и при возврате во вкладку (смена пояса, сон). */
export function useToday(): string {
  const [d, setD] = useState(today);
  useEffect(() => {
    const tick = () => setD(today());
    const id = setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  return d;
}
