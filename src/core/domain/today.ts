/*
 * «Сегодня»: что делать сейчас и дальше, как раскладывается весь день. Чистые функции без React —
 * от раздела здесь только форма строки (TodayItem), поэтому одинаково работает для дел, привычек, платежей и тренировок.
 */
import type { TodayItem } from '../module';

export const toMinutes = (t: string): number => {
  const [h = '0', m = '0'] = t.split(':');
  return Number(h) * 60 + Number(m);
};

const byTime = (a: TodayItem, b: TodayItem) => toMinutes(a.time ?? '99:99') - toMinutes(b.time ?? '99:99');

/** Сколько осталось в верхнем блоке: не больше двух пунктов, иначе это уже не «ближайшее». */
export const NEXT_LIMIT = 2;

/**
 * Ближайшее: невыполненные по времени (просроченные тоже — они всё ещё не сделаны), а если их меньше двух —
 * добираем дела без времени в том порядке, в каком их отдали разделы.
 */
export function nextUp(items: readonly TodayItem[], limit = NEXT_LIMIT): TodayItem[] {
  const open = items.filter((i) => !i.done);
  const timed = open.filter((i) => i.time).sort(byTime);
  return [...timed, ...open.filter((i) => !i.time)].slice(0, limit);
}

export interface DaySections {
  /** Невыполненные со временем, по времени. */
  timed: TodayItem[];
  /** Невыполненные без времени. */
  untimed: TodayItem[];
  /** Сделанное: сворачивается внизу. */
  done: TodayItem[];
}

export function daySections(items: readonly TodayItem[]): DaySections {
  return {
    timed: items.filter((i) => !i.done && i.time).sort(byTime),
    untimed: items.filter((i) => !i.done && !i.time),
    done: items.filter((i) => i.done).sort(byTime),
  };
}

function duration(min: number): string {
  if (min < 60) return `${String(min)} мин`;
  const h = Math.floor(min / 60);
  return min % 60 === 0 ? `${String(h)} ч` : `${String(h)} ч ${String(min % 60)} мин`;
}

/** «через 40 мин», «просрочено на 2 ч», «сейчас», «без времени». */
export function relativeTime(time: string | undefined, nowMin: number): string {
  if (!time) return 'без времени';
  const d = toMinutes(time) - nowMin;
  if (d < -1) return `просрочено на ${duration(-d)}`;
  if (d <= 1) return 'сейчас';
  return `через ${duration(d)}`;
}
