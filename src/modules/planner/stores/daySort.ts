import { create } from 'zustand';
import { isDaySort, type DaySort } from '../domain/daySort';

/* Выбранный порядок задач дня. Личная настройка устройства: хранится в localStorage, по умолчанию — по времени. */
const KEY = 'pp-day-sort';

function load(): DaySort {
  try {
    const raw = localStorage.getItem(KEY);
    return isDaySort(raw) ? raw : 'time';
  } catch {
    return 'time'; // хранилище недоступно — по умолчанию
  }
}

interface State {
  mode: DaySort;
  setMode: (m: DaySort) => void;
}

export const useDaySort = create<State>((set) => ({
  mode: load(),
  setMode: (mode) => {
    set({ mode });
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      // не страшно: порядок живёт до перезагрузки
    }
  },
}));
