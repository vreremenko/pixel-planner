import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { loadOccurrences } from '../data/hooks';
import { seriesRepo, taskRepo, xpRepo } from '../data/repo';
import {
  createTask,
  deleteOccurrence,
  editOccurrence,
  moveUnfinishedToTomorrow,
  toggleOccurrence,
  toggleTask,
  type TaskDraft,
} from './tasks';

const draft = (p: Partial<TaskDraft> = {}): TaskDraft => ({
  title: 'Зарядка',
  date: '2026-01-01',
  priority: 'medium',
  tags: [],
  repeat: { pattern: { freq: 'daily' }, end: { type: 'never' } },
  ...p,
});

const occ = async (from: string, to: string) => loadOccurrences(from, to, '2026-01-01');

describe('сервис задач', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('хранит одну серию, а не копии', async () => {
    await createTask(draft());
    expect(await seriesRepo.all()).toHaveLength(1);
    expect(await occ('2026-01-01', '2026-12-31')).toHaveLength(365);
  });

  it('«только эта»: правка не задевает соседей', async () => {
    await createTask(draft());
    const [o] = await occ('2026-01-03', '2026-01-03');
    await editOccurrence(o!, draft({ title: 'Йога', date: '2026-01-03', time: '09:00' }), 'this');
    const list = await occ('2026-01-02', '2026-01-04');
    expect(list.map((x) => x.title)).toEqual(['Зарядка', 'Йога', 'Зарядка']);
    expect(list[1]?.time).toBe('09:00');
  });

  it('«эта и все следующие»: делит серию, прошлое не меняется, отметки переезжают', async () => {
    await createTask(draft());
    const [o5] = await occ('2026-01-05', '2026-01-05');
    const [o7] = await occ('2026-01-07', '2026-01-07');
    await toggleOccurrence(o7!, true);
    await editOccurrence(o5!, draft({ title: 'Бег', date: '2026-01-05' }), 'following');
    expect(await seriesRepo.all()).toHaveLength(2);
    const list = await occ('2026-01-03', '2026-01-08');
    expect(list.map((x) => `${x.date}:${x.title}`).sort()).toEqual([
      '2026-01-03:Зарядка', '2026-01-04:Зарядка', '2026-01-05:Бег', '2026-01-06:Бег', '2026-01-07:Бег', '2026-01-08:Бег',
    ]);
    expect(list.find((x) => x.date === '2026-01-07')?.status).toBe('done');
  });

  it('удаление «эта и все следующие» оставляет прошлое', async () => {
    await createTask(draft());
    const [o] = await occ('2026-01-10', '2026-01-10');
    await deleteOccurrence(o!, 'following');
    expect(await occ('2026-01-01', '2026-01-31')).toHaveLength(9);
  });

  it('удаление только этой', async () => {
    await createTask(draft());
    const [o] = await occ('2026-01-10', '2026-01-10');
    await deleteOccurrence(o!, 'this');
    expect(await occ('2026-01-09', '2026-01-11')).toHaveLength(2);
  });

  it('XP идемпотентен и отзывается при снятии отметки', async () => {
    await createTask(draft({ repeat: undefined }));
    const [t] = await taskRepo.all();
    await toggleTask(t!, true);
    await toggleTask({ ...t!, done: false }, true);
    expect(await xpRepo.total()).toBeGreaterThanOrEqual(20);
    const withAch = await xpRepo.total();
    await toggleTask(t!, false);
    expect(await xpRepo.total()).toBe(withAch - 20);
  });

  it('перенос невыполненных на завтра', async () => {
    await createTask(draft({ repeat: undefined, title: 'A' }));
    await createTask(draft({ repeat: undefined, title: 'B' }));
    const a = (await taskRepo.byDate('2026-01-01')).find((t) => t.title === 'A');
    await toggleTask(a!, true);
    expect(await moveUnfinishedToTomorrow('2026-01-01')).toBe(1);
    const moved = await taskRepo.byDate('2026-01-02');
    expect(moved.map((t) => [t.title, t.postponedCount])).toEqual([['B', 1]]);
  });
});
