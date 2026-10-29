import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../data/db';
import { loadOccurrences } from '../data/hooks';
import { seriesRepo, taskRepo, xpRepo } from '../data/repo';
import {
  createTask,
  deleteOccurrence,
  editOccurrence,
  updateTask,
  moveUnfinishedToTomorrow,
  toggleChecklistItem,
  toggleOccurrenceChecklistItem,
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

  describe('чек-лист', () => {
    const items = (...texts: string[]) => texts.map((text, i) => ({ id: `i${String(i)}`, text, done: false }));

    it('обычная задача: пункты сохраняются, пустые отбрасываются, отметки переключаются', async () => {
      await createTask(draft({ repeat: undefined, checklist: items('молоко', '  ', 'хлеб') }));
      const [t] = await taskRepo.all();
      expect(t?.checklist?.map((i) => i.text)).toEqual(['молоко', 'хлеб']);
      await toggleChecklistItem(t!, 'i0');
      const [t2] = await taskRepo.all();
      expect(t2?.checklist?.map((i) => i.done)).toEqual([true, false]);
      expect(t2?.done).toBe(false); // задача сама не закрывается
    });

    it('правка: чек-лист можно убрать целиком, заметки и чек-лист живут вместе', async () => {
      await createTask(draft({ repeat: undefined, notes: 'важно', checklist: items('а') }));
      const [t] = await taskRepo.all();
      expect(t?.notes).toBe('важно');
      expect(t?.checklist).toHaveLength(1);
      await updateTask(t!, draft({ repeat: undefined, notes: 'важно' }));
      const [t2] = await taskRepo.all();
      expect(t2?.checklist).toBeUndefined();
      expect(t2?.notes).toBe('важно');
    });

    it('повторяющаяся: шаблон без отметок, отметки по дням независимы', async () => {
      await createTask(draft({ checklist: [{ id: 'x', text: 'шаг', done: true }, { id: 'y', text: 'ещё', done: false }] }));
      const [series] = await seriesRepo.all();
      expect(series?.checklist?.every((i) => !i.done)).toBe(true);
      const [d1] = await occ('2026-01-01', '2026-01-01');
      await toggleOccurrenceChecklistItem(d1!, 'x');
      const days = await occ('2026-01-01', '2026-01-02');
      expect(days[0]?.checklist?.map((i) => i.done)).toEqual([true, false]);
      expect(days[1]?.checklist?.map((i) => i.done)).toEqual([false, false]);
      // снять отметку
      await toggleOccurrenceChecklistItem(days[0]!, 'x');
      expect((await occ('2026-01-01', '2026-01-01'))[0]?.checklist?.every((i) => !i.done)).toBe(true);
    });

    it('«только эта»: свой список в этот день, соседние дни по шаблону', async () => {
      await createTask(draft({ checklist: items('общий') }));
      const [d2] = await occ('2026-01-02', '2026-01-02');
      await editOccurrence(
        d2!,
        draft({ date: '2026-01-02', checklist: [{ id: 'z', text: 'только сегодня', done: true }] }),
        'this',
      );
      const days = await occ('2026-01-01', '2026-01-03');
      expect(days.map((d) => d.checklist?.map((i) => i.text))).toEqual([['общий'], ['только сегодня'], ['общий']]);
      expect(days[1]?.checklist?.[0]?.done).toBe(true);
    });

    it('«только эта»: можно убрать чек-лист только у одного дня', async () => {
      await createTask(draft({ checklist: items('общий') }));
      const [d2] = await occ('2026-01-02', '2026-01-02');
      await editOccurrence(d2!, draft({ date: '2026-01-02' }), 'this');
      const days = await occ('2026-01-01', '2026-01-03');
      expect(days.map((d) => d.checklist?.length ?? 0)).toEqual([1, 0, 1]);
    });

    it('«эта и все следующие»: новый шаблон дальше, прошлое не меняется, отметка выбранного дня сохраняется', async () => {
      await createTask(draft({ checklist: items('старый') }));
      const [d3] = await occ('2026-01-03', '2026-01-03');
      await editOccurrence(
        d3!,
        draft({ date: '2026-01-03', checklist: [{ id: 'n1', text: 'новый', done: true }, { id: 'n2', text: 'второй', done: false }] }),
        'following',
      );
      const days = (await occ('2026-01-02', '2026-01-04')).sort((a, b) => a.date.localeCompare(b.date));
      expect(days.map((d) => d.checklist?.map((i) => i.text))).toEqual([['старый'], ['новый', 'второй'], ['новый', 'второй']]);
      expect(days[1]?.checklist?.map((i) => i.done)).toEqual([true, false]);
      expect(days[2]?.checklist?.map((i) => i.done)).toEqual([false, false]);
    });
  });
});
