/*
 * Что записывается в подходе — в одном месте для всех экранов (упражнение, программа, тренировка) и для нейросети:
 *   weight_reps — вес и повторы (штанга, гантели, тренажёры);
 *   reps — повторы со своим весом (отжимания, подтягивания);
 *   time — время (планка, статика);
 *   distance_time — дистанция и время (бег, велосипед).
 */
import type { ProgramItem, Tracking } from './types';

export const TRACKINGS: Record<Tracking, { label: string; hint: string }> = {
  weight_reps: { label: 'Вес и повторы', hint: 'Штанга, гантели, тренажёры' },
  reps: { label: 'Повторы', hint: 'Свой вес: отжимания, подтягивания, скручивания' },
  time: { label: 'Время', hint: 'Планка, статика, растяжка' },
  distance_time: { label: 'Дистанция', hint: 'Бег, велосипед, ходьба: километры и время' },
};
export const TRACKING_IDS = Object.keys(TRACKINGS) as Tracking[];

/** 90 → «1:30», 3725 → «1:02:05». */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${String(h)}:${pad(m)}:${pad(s % 60)}` : `${String(m)}:${pad(s % 60)}`;
}

/**
 * Время из поля ввода: «1:30», «1:02:05» или просто число — в секундах (`plain: 'sec'`)
 * или минутах (`plain: 'min'`, для кардио). null — пусто или не время.
 */
export function parseDuration(text: string, plain: 'sec' | 'min'): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) {
    const n = Number(t);
    return n > 0 ? Math.round(plain === 'min' ? n * 60 : n) : null;
  }
  const m = /^(?:(\d+):)?(\d{1,3}):(\d{1,2})$/.exec(t);
  if (!m) return null;
  const sec = Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  return sec > 0 && Number(m[3]) < 60 ? sec : null;
}

/** Время для поля ввода в его единице: секунды или минуты (25.5). */
export const durationInput = (sec: number, plain: 'sec' | 'min') => String(plain === 'min' ? Math.round((sec / 60) * 100) / 100 : sec);

const km = (m: number) => `${String(Math.round(m / 100) / 10)} км`;

/** Цель дня программы по типу упражнения: «3 × 8–12 · 60 кг», «3 × 1:00», «5 км · 30:00». */
export function programTarget(item: ProgramItem, tracking: Tracking): string {
  const sets = String(item.sets);
  switch (tracking) {
    case 'weight_reps':
      return `${sets} × ${item.reps ?? '—'}${item.weight ? ` · ${String(item.weight)} кг` : ''}`;
    case 'reps':
      return `${sets} × ${item.reps ?? '—'}`;
    case 'time':
      return `${sets} × ${item.durationSec ? formatDuration(item.durationSec) : '—'}`;
    case 'distance_time': {
      const parts = [item.distanceM ? km(item.distanceM) : '', item.durationSec ? formatDuration(item.durationSec) : ''].filter(Boolean);
      return `${item.sets > 1 ? `${sets} × ` : ''}${parts.join(' · ') || '—'}`;
    }
  }
}

/** Новый пункт программы с разумной целью по типу упражнения. */
export function defaultItem(exerciseId: string, tracking: Tracking): ProgramItem {
  switch (tracking) {
    case 'weight_reps':
      return { exerciseId, sets: 3, reps: '8–12' };
    case 'reps':
      return { exerciseId, sets: 3, reps: '10–15' };
    case 'time':
      return { exerciseId, sets: 3, durationSec: 60 };
    case 'distance_time':
      return { exerciseId, sets: 1 };
  }
}

/** Оставить у пункта только цели, которые подходят типу упражнения (после смены типа старые не мешают). */
export function cleanItem(item: ProgramItem, tracking: Tracking): ProgramItem {
  const { exerciseId, sets, restSec, reps, weight, durationSec, distanceM } = item;
  const out: ProgramItem = { exerciseId, sets, ...(restSec !== undefined && tracking !== 'distance_time' ? { restSec } : {}) };
  if ((tracking === 'weight_reps' || tracking === 'reps') && reps) out.reps = reps;
  if (tracking === 'weight_reps' && weight !== undefined) out.weight = weight;
  if ((tracking === 'time' || tracking === 'distance_time') && durationSec !== undefined) out.durationSec = durationSec;
  if (tracking === 'distance_time' && distanceM !== undefined) out.distanceM = distanceM;
  return out;
}
