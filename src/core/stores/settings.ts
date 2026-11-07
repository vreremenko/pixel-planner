import { liveQuery } from 'dexie';
import { create } from 'zustand';
import { ACCOUNT_SETTINGS, DEFAULT_SETTINGS, pickAccountSettings, type Settings } from '../domain/types';
import { db } from '../data/db';
import { appPrefsRepo, settingsRepo } from '../data/repo';

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (p: Partial<Omit<Settings, 'id'>>) => Promise<void>;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

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
      set({ settings: { ...s, ...pickAccountSettings((await appPrefsRepo.get()) ?? {}) }, loaded: true });
      void seedAccountSettings(s);
      followAccountSettings();
    } catch (e) {
      console.error('settings load failed', e);
      set({ loaded: true });
    }
  },
  update: async (p) => {
    const next = { ...get().settings, ...p };
    set({ settings: next });
    await settingsRepo.patch(p);
    if (ACCOUNT_SETTINGS.some((k) => k in p)) await appPrefsRepo.put(pickAccountSettings(next));
  },
}));

/**
 * Общих настроек ещё нет (появились в этой версии): берём их с устройства, где настройки уже меняли.
 * Время ставим от прежней правки, поэтому более свежая настройка с другого устройства победит.
 * Новое устройство без своих настроек ничего не отправляет и просто получит общие.
 */
async function seedAccountSettings(s: Settings): Promise<void> {
  if ((await appPrefsRepo.get()) || !(await db.settings.get('settings'))) return;
  await appPrefsRepo.put(pickAccountSettings(s), s.updatedAt || Date.now());
}

let following = false;

/** Общие настройки пришли с другого устройства: применяем их здесь. */
function followAccountSettings(): void {
  if (following) return;
  following = true;
  liveQuery(() => appPrefsRepo.get()).subscribe((prefs) => {
    if (!prefs) return;
    const incoming = pickAccountSettings(prefs);
    const { settings } = useSettings.getState();
    if (same(incoming, pickAccountSettings(settings))) return;
    useSettings.setState({ settings: { ...settings, ...incoming } });
    void settingsRepo.patch(incoming);
  });
}
