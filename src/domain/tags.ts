import type { LocalDate, RecurringSeries, Task } from './types';

/** Метка в едином виде: без «#», в нижнем регистре («Работа» и «работа» — одна метка). */
export const normalizeTag = (t: string): string => t.trim().replace(/^#/, '').trim().toLowerCase();

/** Список меток из поля ввода («работа, #Дом, работа») — без пустых и повторов. */
export function parseTagInput(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(',')) {
    const t = normalizeTag(part);
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Есть ли у элемента все выбранные метки (фильтр сужает: «работа» + «срочно» = и то и другое). */
export function hasAllTags(itemTags: readonly string[], selected: readonly string[]): boolean {
  if (selected.length === 0) return true;
  const own = new Set(itemTags.map(normalizeTag));
  return selected.every((t) => own.has(normalizeTag(t)));
}

export interface TagCount {
  tag: string;
  count: number;
}

/** Метки со счётчиком: чаще используемые — первыми, при равенстве — по алфавиту. */
export function tagCounts(lists: readonly (readonly string[])[]): TagCount[] {
  const map = new Map<string, number>();
  for (const list of lists) {
    // Одна метка дважды в одном элементе считается один раз
    for (const t of new Set(list.map(normalizeTag))) if (t) map.set(t, (map.get(t) ?? 0) + 1);
  }
  return [...map].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ru'));
}

export interface TagGroups {
  overdue: Task[];
  today: Task[];
  upcoming: Task[];
  backlog: Task[];
  done: Task[];
  series: RecurringSeries[];
}

const byDate = (a: Task, b: Task) => (a.date ?? '').localeCompare(b.date ?? '') || a.order - b.order;

/** Все задачи с меткой по разделам: просрочено, сегодня, дальше, инвентарь, готово + повторы. */
export function groupByTag(tasks: readonly Task[], series: readonly RecurringSeries[], tag: string, todayDate: LocalDate, doneLimit = 20): TagGroups {
  const mine = tasks.filter((t) => !t.deletedAt && hasAllTags(t.tags, [tag]));
  const open = mine.filter((t) => !t.done);
  return {
    overdue: open.filter((t) => t.date !== null && t.date < todayDate).sort(byDate),
    today: open.filter((t) => t.date === todayDate).sort(byDate),
    upcoming: open.filter((t) => t.date !== null && t.date > todayDate).sort(byDate),
    backlog: open.filter((t) => t.date === null).sort((a, b) => a.order - b.order),
    done: mine
      .filter((t) => t.done)
      .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))
      .slice(0, doneLimit),
    series: series.filter((s) => !s.deletedAt && hasAllTags(s.tags, [tag])),
  };
}
