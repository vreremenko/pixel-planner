import { create } from 'zustand';
import { DEFAULT_HOURS } from '../domain/track';

/* Часы трека дня (подъём и отбой) — личная настройка устройства: localStorage, не синхронизируется. */
const KEY = 'pixel-planner:track-hours';

interface Hours {
  from: number;
  to: number;
}

function load(): Hours {
  try {
    const p: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (typeof p === 'object' && p !== null && 'from' in p && 'to' in p && typeof p.from === 'number' && typeof p.to === 'number' && p.from >= 0 && p.to <= 24 && p.to - p.from >= 4) {
      return { from: p.from, to: p.to };
    }
  } catch {
    // нет хранилища или оно повреждено — берём значения по умолчанию
  }
  return { ...DEFAULT_HOURS };
}

interface State extends Hours {
  set: (h: Hours) => void;
}

export const useTrackHours = create<State>((set) => ({
  ...load(),
  set: (h) => {
    set(h);
    try {
      localStorage.setItem(KEY, JSON.stringify(h));
    } catch {
      // состояние живёт до перезагрузки
    }
  },
}));
