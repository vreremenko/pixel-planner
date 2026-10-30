import { create } from 'zustand';
import { DEFAULT_SETTINGS, type Settings } from '../domain/types';
import { settingsRepo } from '../data/repo';

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (p: Partial<Omit<Settings, 'id'>>) => Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  load: async () => {
    try {
      // Если база не отвечает — работаем на настройках по умолчанию, а не висим
      const s = await Promise.race([
        settingsRepo.get(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('IndexedDB timeout')), 8000)),
      ]);
      set({ settings: s, loaded: true });
    } catch (e) {
      console.error('settings load failed', e);
      set({ loaded: true });
    }
  },
  update: async (p) => {
    set({ settings: { ...get().settings, ...p } });
    await settingsRepo.patch(p);
  },
}));
