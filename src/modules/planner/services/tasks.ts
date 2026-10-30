import { addDays, today } from '../../../core/domain/dates';
import { overrideId, splitRule } from '../domain/recurrence';
import type { LocalDate, LocalTime } from '../../../core/domain/types';
import type { ChecklistItem, Occurrence, OccurrenceOverride, Priority, RecurrenceEnd, RecurrencePattern, RecurrenceRule, RecurringSeries, ReminderSpec, Task } from '../domain/types';
import { checkedIds, cleanChecklist, stripDone, toggleItem } from '../domain/checklist';
import { normalizeReminders } from '../domain/reminderSpecs';
import { stamp } from '../../../core/data/repo';
import { overrideRepo, seriesRepo, tables, taskRepo } from '../data/repo';
import { db } from '../../../core/data/db';
import { play } from '../../../core/sfx';

export interface TaskDraft {
  title: string;
  notes?: string;
  /** Пункты чек-листа; done учитывается у обычных задач и у выбранного дня повтора. */
  checklist?: ChecklistItem[];
  date: LocalDate | null;
  time?: LocalTime;
  priority: Priority;
  tags: string[];
  /** Напоминания (нужно время); повторы и недопустимые значения при сохранении отбрасываются. */
  reminders?: ReminderSpec[];
  /** Если задано — задача повторяющаяся (start = date). */
  repeat?: { pattern: RecurrencePattern; end: RecurrenceEnd };
}

export type EditScope = 'this' | 'following';

function optional<T extends object>(o: T): T {
  // exactOptionalPropertyTypes: убираем ключи со значением undefined
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

async function nextOrder(date: LocalDate | null): Promise<number> {
  const list = date === null ? await taskRepo.backlog() : await taskRepo.byDate(date);
  return list.reduce((m, t) => Math.max(m, t.order), 0) + 1;
}

function ruleFrom(draft: TaskDraft, start: LocalDate): RecurrenceRule {
  if (!draft.repeat) throw new Error('no repeat');
  return { ...draft.repeat.pattern, start, end: draft.repeat.end };
}

/** forSeries: шаблон серии — пункты без отметок (они хранятся по дням). */
function seriesFields(draft: TaskDraft, forSeries = false) {
  const checklist = cleanChecklist(draft.checklist);
  // Напоминания «за N минут» привязаны ко времени задачи; без времени их нет
  const reminders = draft.time ? normalizeReminders(draft.reminders) : [];
  return optional({
    title: draft.title.trim(),
    notes: draft.notes?.trim() || undefined,
    checklist: checklist && forSeries ? stripDone(checklist) : checklist,
    time: draft.time || undefined,
    priority: draft.priority,
    tags: draft.tags,
    reminders: reminders.length > 0 ? reminders : undefined,
  });
}

export async function createTask(draft: TaskDraft): Promise<void> {
  if (draft.repeat) {
    const start = draft.date ?? today();
    await seriesRepo.put(stamp({ ...seriesFields(draft, true), rule: ruleFrom(draft, start) } as RecurringSeries));
    return;
  }
  const task = stamp(
    optional({
      ...seriesFields(draft),
      date: draft.date,
      done: false,
      order: await nextOrder(draft.date),
      wasInBacklog: draft.date === null,
      postponedCount: 0,
    }) as Task,
  );
  await taskRepo.put(task);
}

export async function updateTask(task: Task, draft: TaskDraft): Promise<void> {
  if (draft.repeat) {
    // Обычная задача превращается в повторяющуюся
    await db.transaction('rw', tables.tasks, tables.series, async () => {
      await taskRepo.remove(task.id);
      await createTask({ ...draft, date: draft.date ?? task.date ?? today() });
    });
    return;
  }
  const moved = draft.date !== task.date;
  const { notes: _n, checklist: _c, time: _t, reminder: _r, reminders: _rs, ...rest } = task;
  await taskRepo.put({
    ...rest,
    ...seriesFields(draft),
    date: draft.date,
    order: moved ? await nextOrder(draft.date) : task.order,
    wasInBacklog: task.wasInBacklog || draft.date === null,
  });
}

export async function toggleTask(task: Task, done: boolean): Promise<void> {
  const { doneAt: _d, ...rest } = task;
  await taskRepo.put(done ? { ...rest, done, doneAt: Date.now() } : { ...rest, done });
  play(done ? 'complete' : 'undo');
}

/** Отметить / снять пункт чек-листа обычной задачи. */
export async function toggleChecklistItem(task: Task, itemId: string): Promise<void> {
  if (!task.checklist) return;
  await taskRepo.put({ ...task, checklist: toggleItem(task.checklist, itemId) });
}

export async function deleteTask(id: string): Promise<void> {
  await taskRepo.remove(id);
}

/** Перенести задачу в бэклог (null) или на дату. */
export async function scheduleTask(task: Task, date: LocalDate | null): Promise<void> {
  await taskRepo.put({
    ...task,
    date,
    order: await nextOrder(date),
    wasInBacklog: task.wasInBacklog || date === null,
  });
}

/** Все невыполненные разовые задачи дня — на следующий день. */
/** Если задан `only`, переносятся только задачи с этими id (например, видимые при фильтре по метке). */
export async function moveUnfinishedToTomorrow(date: LocalDate, only?: ReadonlySet<string>): Promise<number> {
  const target = addDays(date, 1);
  const pending = (await taskRepo.byDate(date)).filter((t) => !t.done && (!only || only.has(t.id)));
  let order = await nextOrder(target);
  await taskRepo.bulkPut(
    pending
      .sort((a, b) => a.order - b.order)
      .map((t) => ({ ...t, date: target, order: order++, postponedCount: t.postponedCount + 1 })),
  );
  return pending.length;
}

export type DayItem = { kind: 'task'; task: Task } | { kind: 'occ'; occ: Occurrence };

/** Сохранить новый порядок элементов дня после перетаскивания. */
export async function reorderDay(items: DayItem[]): Promise<void> {
  await db.transaction('rw', tables.tasks, tables.overrides, async () => {
    for (const [i, it] of items.entries()) {
      if (it.kind === 'task') {
        if (it.task.order !== i) await taskRepo.put({ ...it.task, order: i });
      } else if (it.occ.order !== i) {
        await patchOverride(it.occ.seriesId, it.occ.originalDate, { order: i });
      }
    }
  });
}

/* ---------- Повторяющиеся задачи ---------- */

function newOverride(seriesId: string, date: LocalDate): OccurrenceOverride {
  const now = Date.now();
  return { id: overrideId(seriesId, date), seriesId, date, createdAt: now, updatedAt: now };
}

async function patchOverride(
  seriesId: string,
  date: LocalDate,
  patch: Partial<OccurrenceOverride>,
): Promise<void> {
  const id = overrideId(seriesId, date);
  const cur = await overrideRepo.get(id);
  await overrideRepo.put({ ...(cur ?? newOverride(seriesId, date)), ...patch });
}

export async function toggleOccurrence(occ: Occurrence, done: boolean): Promise<void> {
  const id = overrideId(occ.seriesId, occ.originalDate);
  const cur = await overrideRepo.get(id);
  const { status: _s, doneAt: _d, ...base } = cur ?? newOverride(occ.seriesId, occ.originalDate);
  await overrideRepo.put(done ? { ...base, status: 'done', doneAt: Date.now() } : base);
  play(done ? 'complete' : 'undo');
}

/** Отметить / снять пункт чек-листа у экземпляра повторяющейся задачи (только в этот день). */
export async function toggleOccurrenceChecklistItem(occ: Occurrence, itemId: string): Promise<void> {
  if (!occ.checklist) return;
  await patchOverride(occ.seriesId, occ.originalDate, { checked: checkedIds(toggleItem(occ.checklist, itemId)) });
}

export async function skipOccurrence(occ: Occurrence): Promise<void> {
  await patchOverride(occ.seriesId, occ.originalDate, { status: 'skipped' });
}

export async function editOccurrence(occ: Occurrence, draft: TaskDraft, scope: EditScope): Promise<void> {
  const series = await seriesRepo.get(occ.seriesId);
  if (!series) return;

  if (scope === 'this') {
    const f = seriesFields(draft);
    const patch: OccurrenceOverride['patch'] = {
      title: f.title,
      priority: f.priority,
      notes: f.notes ?? '', // пустая строка — «в этот день без заметок»
    };
    // undefined в patch.time означает «убрать» — храним явно через ключ
    (patch as Record<string, unknown>).time = f.time;
    // Напоминания: пустой массив — «в этот день без напоминаний» (шаблон серии не применяется)
    patch.reminders = f.reminders ?? [];
    // Чек-лист: пустой массив — «в этот день пунктов нет» (шаблон серии не применяется)
    const items = f.checklist ?? [];
    patch.checklist = stripDone(items);
    const movedTo = draft.date && draft.date !== occ.originalDate ? draft.date : undefined;
    const cur = await overrideRepo.get(occ.key);
    const { movedTo: _m, ...base } = cur ?? newOverride(occ.seriesId, occ.originalDate);
    await overrideRepo.put({ ...base, patch, checked: checkedIds(items), ...(movedTo ? { movedTo } : {}) });
    return;
  }

  // «Эта и все следующие»: делим серию на две
  const from = occ.originalDate;
  const { before } = splitRule(series.rule, from);
  const { start: _st, end: oldEnd, ...oldPattern } = series.rule;
  const ruleChanged =
    draft.repeat !== undefined &&
    (JSON.stringify(draft.repeat.pattern) !== JSON.stringify(oldPattern) ||
      JSON.stringify(draft.repeat.end) !== JSON.stringify(oldEnd) ||
      (draft.date !== null && draft.date !== from));
  const newRule: RecurrenceRule = ruleChanged
    ? ruleFrom(draft, draft.date ?? from)
    : splitRule(series.rule, from).after;
  const newSeries = stamp({
    ...seriesFields(draft, true),
    rule: newRule,
    splitFromId: series.id,
  } as RecurringSeries);

  await db.transaction('rw', tables.series, tables.overrides, async () => {
    if (before) await seriesRepo.put({ ...series, rule: before });
    else await seriesRepo.remove(series.id);
    await seriesRepo.put(newSeries);
    // Отметки будущих экземпляров переезжают в новую серию (правки содержимого сбрасываются)
    for (const o of await overrideRepo.bySeries(series.id)) {
      if (o.date < from) continue;
      await overrideRepo.put({ ...o, deletedAt: Date.now() });
      if (o.status || o.movedTo || o.cancelled || o.checked?.length) {
        const { patch: _p, ...keep } = o;
        await overrideRepo.put({ ...keep, id: overrideId(newSeries.id, o.date), seriesId: newSeries.id, createdAt: Date.now() });
      }
    }
    // Отметки пунктов в редактируемый день берём из формы
    const doneIds = checkedIds(cleanChecklist(draft.checklist) ?? []);
    const fromId = overrideId(newSeries.id, from);
    const existing = await overrideRepo.get(fromId);
    if (doneIds.length > 0 || existing?.checked) {
      await overrideRepo.put({ ...(existing ?? newOverride(newSeries.id, from)), checked: doneIds });
    }
  });
}

export async function deleteOccurrence(occ: Occurrence, scope: EditScope): Promise<void> {
  if (scope === 'this') {
    await patchOverride(occ.seriesId, occ.originalDate, { cancelled: true });
    return;
  }
  const series = await seriesRepo.get(occ.seriesId);
  if (!series) return;
  const { before } = splitRule(series.rule, occ.originalDate);
  if (before) await seriesRepo.put({ ...series, rule: before });
  else await seriesRepo.remove(series.id);
}
