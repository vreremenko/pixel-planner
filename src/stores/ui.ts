import { create } from 'zustand';
import { addDays, today } from '../domain/dates';
import { normalizeTag } from '../domain/tags';
import type { LocalDate, Occurrence, Task } from '../domain/types';

export type EditorTarget =
  | { kind: 'new'; date: LocalDate | null }
  | { kind: 'task'; task: Task }
  | { kind: 'occurrence'; occ: Occurrence };

interface UiState {
  date: LocalDate;
  setDate: (d: LocalDate) => void;
  shiftDate: (n: number) => void;
  goToday: () => void;
  editor: EditorTarget | null;
  openEditor: (t: EditorTarget) => void;
  closeEditor: () => void;
  calendarOpen: boolean;
  setCalendarOpen: (v: boolean) => void;
  /** Выбранные метки-фильтры экрана дня (сужают список: нужны все выбранные). */
  tagFilter: string[];
  toggleTag: (tag: string) => void;
  clearTags: () => void;
}

export const useUi = create<UiState>((set, get) => ({
  date: today(),
  setDate: (date) => set({ date }),
  shiftDate: (n) => set({ date: addDays(get().date, n) }),
  goToday: () => set({ date: today() }),
  editor: null,
  openEditor: (editor) => set({ editor }),
  closeEditor: () => set({ editor: null }),
  calendarOpen: false,
  setCalendarOpen: (calendarOpen) => set({ calendarOpen }),
  tagFilter: [],
  toggleTag: (tag) => {
    const t = normalizeTag(tag);
    const cur = get().tagFilter;
    set({ tagFilter: cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t] });
  },
  clearTags: () => set({ tagFilter: [] }),
}));
