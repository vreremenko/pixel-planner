import { create } from 'zustand';

export type GameEvent =
  | { id: number; type: 'xp'; amount: number }
  | { id: number; type: 'levelup'; level: number }
  | { id: number; type: 'achievement'; achievementId: string };

type NewEvent =
  | { type: 'xp'; amount: number }
  | { type: 'levelup'; level: number }
  | { type: 'achievement'; achievementId: string };

interface GameState {
  events: GameEvent[];
  emit: (e: NewEvent) => void;
  consume: (id: number) => void;
}

let seq = 0;
export const useGame = create<GameState>((set, get) => ({
  events: [],
  emit: (e) => set({ events: [...get().events, { ...e, id: ++seq }] }),
  consume: (id) => set({ events: get().events.filter((x) => x.id !== id) }),
}));
