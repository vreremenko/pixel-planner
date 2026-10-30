import { create } from 'zustand';

/*
 * Какие блоки интерфейса свёрнуты (привычки, заметки и чек-листы задач).
 * Это личная настройка устройства, поэтому хранится в localStorage, а не в базе данных
 * (не попадает в резервную копию и не синхронизируется). По умолчанию всё развёрнуто.
 */
const STORAGE_KEY = 'pixel-planner:collapsed';

type Collapsed = Record<string, true>;

function load(): Collapsed {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed !== 'object' || parsed === null) return {};
    const out: Collapsed = {};
    for (const [k, v] of Object.entries(parsed)) if (v === true) out[k] = true;
    return out;
  } catch {
    return {}; // хранилище недоступно или повреждено — просто всё развёрнуто
  }
}

function save(value: Collapsed): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // приватный режим / переполнение — состояние живёт только до перезагрузки
  }
}

interface CollapsedState {
  collapsed: Collapsed;
  toggle: (key: string) => void;
  /** Свернуть или развернуть сразу несколько блоков. */
  setMany: (keys: readonly string[], collapsed: boolean) => void;
}

export const useCollapsed = create<CollapsedState>((set, get) => ({
  collapsed: load(),
  toggle: (key) => get().setMany([key], get().collapsed[key] !== true),
  setMany: (keys, value) => {
    // Без delete по динамическому ключу: пересобираем объект
    const drop = new Set(keys);
    const next: Collapsed = value
      ? { ...get().collapsed, ...Object.fromEntries(keys.map((k) => [k, true as const])) }
      : Object.fromEntries(Object.entries(get().collapsed).filter(([k]) => !drop.has(k)));
    save(next);
    set({ collapsed: next });
  },
}));

/** Ключи — в одном месте, чтобы не разъехались. */
export const collapseKey = {
  habit: (id: string) => `habit:${id}`,
  taskNotes: (id: string) => `task:${id}:notes`,
  taskList: (id: string) => `task:${id}:list`,
};
