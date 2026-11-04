import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../core/data/db';
import { overrideRepo, seriesRepo, taskRepo } from '../data/repo';
import { loadOccurrences } from '../data/hooks';
import { createRestOnTrack, createTask, moveUnfinishedToTomorrow, scheduleTask, setOccurrenceTrack, setTaskTrack, updateTask } from './tasks';

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

  it('время задачи следует за первым блоком, а правка времени двигает блоки', async () => {
    await createTask(draft);
    await setTaskTrack(await one(), [{ start: 600, end: 660 }, { start: 540, end: 570 }]);
    expect(await one()).toMatchObject({ time: '09:00', track: [{ start: 540, end: 570 }, { start: 600, end: 660 }] });
    await updateTask(await one(), { ...draft, time: '10:00' });
    expect((await one()).track).toEqual([{ start: 600, end: 630 }, { start: 660, end: 720 }]);
  });

  it('повторяющаяся задача: блоки и время лежат в правке дня, соседние дни не затронуты', async () => {
    await createTask({ ...draft, repeat: { pattern: { freq: 'daily' }, end: { type: 'never' } } });
    const occ = (await loadOccurrences('2026-11-03', '2026-11-04', '2026-11-03')).find((o) => o.date === '2026-11-03')!;
    await setOccurrenceTrack(occ, [{ start: 780, end: 840 }]);
    const after = await loadOccurrences('2026-11-03', '2026-11-04', '2026-11-03');
    expect(after.find((o) => o.date === '2026-11-03')).toMatchObject({ time: '13:00', track: [{ start: 780, end: 840 }] });
    expect(after.find((o) => o.date === '2026-11-04')?.track).toBeUndefined();
    await setOccurrenceTrack(after.find((o) => o.date === '2026-11-03')!, []);
    expect((await loadOccurrences('2026-11-03', '2026-11-03', '2026-11-03'))[0]?.track).toBeUndefined();
    expect((await overrideRepo.all()).length).toBe(1);
    expect((await seriesRepo.all()).length).toBe(1);
  });
});
