import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { completeFromReminder, snoozeReminder } from './quickActions';
import { habitLogRepo, overrideRepo, reminderLogRepo, taskRepo } from './repo';

describe('действия из уведомлений', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('«Выполнено» для экземпляра серии пишет override, повтор ничего не ломает', async () => {
    const key = 'abc-123:2026-01-05';
    await completeFromReminder({ kind: 'occurrence', ref: key, date: '2026-01-05' });
    expect((await overrideRepo.get(key))?.status).toBe('done');
    await completeFromReminder({ kind: 'occurrence', ref: key, date: '2026-01-05' });
    expect((await overrideRepo.get(key))?.status).toBe('done');
  });

  it('«Выполнено» для задачи и привычки', async () => {
    await taskRepo.put({ id: 't', createdAt: 0, updatedAt: 0, title: 'x', date: '2026-01-05', priority: 'high', done: false, order: 0, tags: [], wasInBacklog: false, postponedCount: 0 });
    await completeFromReminder({ kind: 'task', ref: 't', date: '2026-01-05' });
    expect((await taskRepo.get('t'))?.done).toBe(true);
    await completeFromReminder({ kind: 'habit', ref: 'h', date: '2026-01-05' });
    expect(await habitLogRepo.isDone('h', '2026-01-05')).toBe(true);
  });

  it('«Отложить» ставит snoozedUntil через 10 минут', async () => {
    await reminderLogRepo.put({ id: 'k', key: 'k', kind: 'task', ref: 't', date: '2026-01-05', title: 'x', body: '', fireAt: 0, createdAt: 0, updatedAt: 0, acknowledged: false });
    const before = Date.now();
    await snoozeReminder('k');
    const log = await reminderLogRepo.get('k');
    expect(log?.snoozedUntil).toBeGreaterThanOrEqual(before + 600_000);
    expect(await reminderLogRepo.unacknowledged(Date.now())).toHaveLength(0);
  });
});
