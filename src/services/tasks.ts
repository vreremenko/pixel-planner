import { addDays, today } from '../domain/dates';
import { overrideId, splitRule } from '../domain/recurrence';
import type {
  LocalDate,
  LocalTime,
  Occurrence,
  OccurrenceOverride,
  Priority,
  RecurrenceEnd,
  RecurrencePattern,
  RecurrenceRule,
  RecurringSeries,
  ReminderSpec,
  Task,
} from '../domain/types';
import { XP_OCCURRENCE, XP_TASK } from '../domain/xp';
import { metaRepo, overrideRepo, seriesRepo, stamp, taskRepo } from '../data/repo';
import { db } from '../data/db';
import { awardXp, checkAchievements, revokeXp } from './game';
import { play } from './sfx';

export interface TaskDraft {
  title: string;
  notes?: string;
  date: LocalDate | null;
  time?: LocalTime;
  priority: Priority;
  tags: string[];
  reminder?: ReminderSpec;
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

function seriesFields(draft: TaskDraft) {
  return optional({
    title: draft.title.trim(),
    notes: draft.notes?.trim() || undefined,
    time: draft.time || undefined,
    priority: draft.priority,
    tags: draft.tags,
    reminder: draft.time ? draft.reminder : undefined,
  });
}

export async function createTask(draft: TaskDraft): Promise<void> {
  if (draft.repeat) {
    const start = draft.date ?? today();
    await seriesRepo.put(stamp({ ...seriesFields(draft), rule: ruleFrom(draft, start) } as RecurringSeries));
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
  if (draft.date === null) await metaRepo.set('backlogUsed', true);
}

export async function updateTask(task: Task, draft: TaskDraft): Promise<void> {
  if (draft.repeat) {
    // Обычная задача превращается в повторяющуюся
    await db.transaction('rw', db.tasks, db.series, async () => {
      await taskRepo.remove(task.id);
      await createTask({ ...draft, date: draft.date ?? task.date ?? today() });
    });
    return;
  }
  const moved = draft.date !== task.date;
  const { notes: _n, time: _t, reminder: _r, ...rest } = task;
  await taskRepo.put({
    ...rest,
    ...seriesFields(draft),
    date: draft.date,
    order: moved ? await nextOrder(draft.date) : task.order,
    wasInBacklog: task.wasInBacklog || draft.date === null,
  });
  if (draft.date === null) await metaRepo.set('backlogUsed', true);
}

export async function toggleTask(task: Task, done: boolean): Promise<void> {
  const { doneAt: _d, ...rest } = task;
  await taskRepo.put(done ? { ...rest, done, doneAt: Date.now() } : { ...rest, done });
  if (done) await awardXp('task', task.id, XP_TASK[task.priority], task.date ?? today());
  else {
    await revokeXp('task', task.id);
    play('undo');
  }
}

export async function deleteTask(id: string): Promise<void> {
  await revokeXp('task', id);
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
  if (date === null) await metaRepo.set('backlogUsed', true);
  else await checkAchievements();
}

/** Все невыполненные разовые задачи дня — на следующий день. */
export async function moveUnfinishedToTomorrow(date: LocalDate): Promise<number> {
  const target = addDays(date, 1);
  const pending = (await taskRepo.byDate(date)).filter((t) => !t.done);
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
  await db.transaction('rw', db.tasks, db.overrides, async () => {
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
  if (done) await awardXp('occurrence', occ.key, XP_OCCURRENCE, occ.date);
  else {
    await revokeXp('occurrence', occ.key);
    play('undo');
  }
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
      ...(f.notes !== undefined ? { notes: f.notes } : {}),
    };
    // undefined в patch.time/reminder означает «убрать» — храним явно через ключ
    (patch as Record<string, unknown>).time = f.time;
    (patch as Record<string, unknown>).reminder = f.reminder;
    const movedTo = draft.date && draft.date !== occ.originalDate ? draft.date : undefined;
    const cur = await overrideRepo.get(occ.key);
    const { movedTo: _m, ...base } = cur ?? newOverride(occ.seriesId, occ.originalDate);
    await overrideRepo.put({ ...base, patch, ...(movedTo ? { movedTo } : {}) });
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
    ...seriesFields(draft),
    rule: newRule,
    splitFromId: series.id,
  } as RecurringSeries);

  await db.transaction('rw', db.series, db.overrides, async () => {
    if (before) await seriesRepo.put({ ...series, rule: before });
    else await seriesRepo.remove(series.id);
    await seriesRepo.put(newSeries);
    // Отметки будущих экземпляров переезжают в новую серию (правки содержимого сбрасываются)
    for (const o of await overrideRepo.bySeries(series.id)) {
      if (o.date < from) continue;
      await overrideRepo.put({ ...o, deletedAt: Date.now() });
      if (o.status || o.movedTo || o.cancelled) {
        const { patch: _p, ...keep } = o;
        await overrideRepo.put({ ...keep, id: overrideId(newSeries.id, o.date), seriesId: newSeries.id, createdAt: Date.now() });
      }
    }
  });
}

export async function deleteOccurrence(occ: Occurrence, scope: EditScope): Promise<void> {
  if (scope === 'this') {
    await patchOverride(occ.seriesId, occ.originalDate, { cancelled: true });
    await revokeXp('occurrence', occ.key);
    return;
  }
  const series = await seriesRepo.get(occ.seriesId);
  if (!series) return;
  const { before } = splitRule(series.rule, occ.originalDate);
  if (before) await seriesRepo.put({ ...series, rule: before });
  else await seriesRepo.remove(series.id);
}
