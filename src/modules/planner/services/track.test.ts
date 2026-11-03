import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../core/data/db';
import { taskRepo } from '../data/repo';
import { createRestOnTrack, createTask, moveUnfinishedToTomorrow, scheduleTask, setTaskTrack, updateTask } from './tasks';

const draft = { title: 'Работа', date: '2026-11-03', priority: 'medium' as const, tags: ['работа'] };
const one = async () => (await taskRepo.byDate('2026-11-03'))[0]!;

describe('трек дня: хранение в задаче', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('блоки пишутся в задачу и снимаются пустым списком', async () => {
    await createTask(draft);
    await setTaskTrack(await one(), [{ start: 540, end: 660 }, { start: 690, end: 720 }]);
    expect((await one()).track).toEqual([{ start: 540, end: 660 }, { start: 690, end: 720 }]);
    await setTaskTrack(await one(), []);
    expect((await one()).track).toBeUndefined();
  });

  it('правка названия не трогает блоки', async () => {
    await createTask(draft);
    await setTaskTrack(await one(), [{ start: 540, end: 600 }]);
    await updateTask(await one(), { ...draft, title: 'Работа 2' });
    expect((await one()).track).toEqual([{ start: 540, end: 600 }]);
  });

  it('перенос на другой день, в бэклог и «на завтра» сбрасывает блоки', async () => {
    await createTask(draft);
    await setTaskTrack(await one(), [{ start: 540, end: 600 }]);
    await updateTask(await one(), { ...draft, date: '2026-11-05' });
    expect((await taskRepo.byDate('2026-11-05'))[0]?.track).toBeUndefined();

    await setTaskTrack((await taskRepo.byDate('2026-11-05'))[0]!, [{ start: 600, end: 660 }]);
    await scheduleTask((await taskRepo.byDate('2026-11-05'))[0]!, null);
    expect((await taskRepo.backlog())[0]?.track).toBeUndefined();

    await createTask(draft);
    await setTaskTrack(await one(), [{ start: 540, end: 600 }]);
    await moveUnfinishedToTomorrow('2026-11-03');
    expect((await taskRepo.byDate('2026-11-04'))[0]?.track).toBeUndefined();
  });

  it('«Отдых» с трека — обычная задача с меткой и блоком', async () => {
    await createRestOnTrack('2026-11-03', { start: 600, end: 630 });
    const t = await one();
    expect(t).toMatchObject({ title: 'Отдых', tags: ['отдых'], track: [{ start: 600, end: 630 }] });
  });
});
