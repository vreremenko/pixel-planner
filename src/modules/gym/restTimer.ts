/* Таймер отдыха между подходами: один на приложение, живёт вне экранов (можно уйти со страницы тренировки). */
import { create } from 'zustand';
import { play } from '../../core/sfx';

interface RestTimer {
  endsAt: number | null;
  total: number;
  start: (sec: number) => void;
  add: (sec: number) => void;
  stop: () => void;
}

let timer: ReturnType<typeof setTimeout> | undefined;

function arm(endsAt: number) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    useRestTimer.setState({ endsAt: null });
    play('timer', true);
    // На iPhone вибрации из браузера нет
    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
  }, Math.max(0, endsAt - Date.now()));
}

export const useRestTimer = create<RestTimer>((set, get) => ({
  endsAt: null,
  total: 0,
  start: (sec) => {
    const endsAt = Date.now() + sec * 1000;
    set({ endsAt, total: sec });
    arm(endsAt);
  },
  add: (sec) => {
    const cur = get().endsAt;
    if (cur === null) return;
    const endsAt = Math.max(Date.now() + 1000, cur + sec * 1000);
    set({ endsAt, total: Math.max(get().total + sec, 1) });
    arm(endsAt);
  },
  stop: () => {
    clearTimeout(timer);
    set({ endsAt: null });
  },
}));
