import { create } from 'zustand';
import type { IconName } from './icons';

export interface Toast {
  id: number;
  text: string;
  icon: IconName;
  color?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>, ms?: number) => void;
  dismiss: (id: number) => void;
}

let seq = 0;
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t, ms = 3500) => {
    const id = ++seq;
    set({ toasts: [...get().toasts.slice(-3), { ...t, id }] });
    setTimeout(() => get().dismiss(id), ms);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}));

export const toast = (text: string, icon: IconName = 'star', color?: string) =>
  useToasts.getState().push(color ? { text, icon, color } : { text, icon });

