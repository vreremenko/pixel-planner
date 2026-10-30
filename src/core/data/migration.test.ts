import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { AppDB } from './db';

describe('обновление базы со старой версии', () => {
  it('данные версии 1 сохраняются, таблицы геймификации удаляются', async () => {
    const name = `old-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(1).stores({
      tasks: 'id, date, updatedAt',
      series: 'id, updatedAt',
      overrides: 'id, seriesId, date, movedTo, updatedAt',
      habits: 'id, updatedAt',
      habitLogs: 'id, habitId, date, updatedAt',
      xp: 'id, date, updatedAt',
      achievements: 'id, updatedAt',
      reminderLogs: 'id, fireAt, updatedAt',
      settings: 'id',
      meta: 'key',
    });
    await old.table('tasks').put({ id: 't1', date: '2026-10-30', updatedAt: 1, title: 'Старая задача' });
    await old.table('xp').put({ id: 'task:t1', date: '2026-10-30', updatedAt: 1, amount: 20 });
    old.close();

    const db = new AppDB(name);
    await db.open();
    expect((await db.table('tasks').get('t1')) as unknown).toMatchObject({ title: 'Старая задача' });
    expect(db.tables.map((t) => t.name)).not.toContain('xp');
    expect(db.tables.map((t) => t.name)).not.toContain('achievements');
    db.close();
  });
});
