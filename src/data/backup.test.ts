import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { exportAll, importBackup, parseBackup } from './backup';
import { habitLogRepo, stamp, taskRepo } from './repo';
import type { Task } from '../domain/types';

const task = (title: string): Task =>
  ({ ...stamp({}), title, date: '2026-01-05', priority: 'low', done: false, order: 0, tags: [], wasInBacklog: false, postponedCount: 0 });

describe('бэкап', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('экспорт → импорт (replace) восстанавливает данные', async () => {
    await taskRepo.put(task('A'));
    await habitLogRepo.set('h1', '2026-01-05', true);
    const json = JSON.stringify(await exportAll());
    await Promise.all(db.tables.map((t) => t.clear()));
    await importBackup(parseBackup(json), 'replace');
    expect((await taskRepo.all()).map((t) => t.title)).toEqual(['A']);
    expect(await habitLogRepo.isDone('h1', '2026-01-05')).toBe(true);
  });

  it('merge: побеждает более свежая запись', async () => {
    const t = task('старое');
    await db.tasks.put({ ...t, updatedAt: 100 });
    const backup = await exportAll();
    backup.tables.tasks = [{ ...t, title: 'новое', updatedAt: 200 }];
    await importBackup(backup, 'merge');
    expect((await taskRepo.get(t.id))?.title).toBe('новое');
    backup.tables.tasks = [{ ...t, title: 'устаревшее', updatedAt: 50 }];
    await importBackup(backup, 'merge');
    expect((await taskRepo.get(t.id))?.title).toBe('новое');
  });

  it('отклоняет чужие и битые файлы', () => {
    expect(() => parseBackup('nope')).toThrow('JSON');
    expect(() => parseBackup('{"app":"x"}')).toThrow('PIXEL PLANNER');
    expect(() => parseBackup(JSON.stringify({ app: 'pixel-planner', schemaVersion: 1, tables: { tasks: [{}] } }))).toThrow('tasks');
  });
});
