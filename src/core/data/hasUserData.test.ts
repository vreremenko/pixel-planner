import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { hasUserData, metaRepo, stamp } from './repo';
import { habitRepo } from '../../modules/planner/data/repo';
import type { Habit } from '../../modules/planner/domain/types';

describe('hasUserData / lastSeenVersion', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
  it('пустая база — новая установка', async () => {
    expect(await hasUserData()).toBe(false);
  });
  it('служебные записи (meta) не считаются данными пользователя', async () => {
    await metaRepo.set('lastSeenVersion', '0.3.0');
    expect(await hasUserData()).toBe(false);
  });
  it('после появления привычки — есть данные', async () => {
    await habitRepo.put(stamp({ name: 'Вода', icon: 'drop', schedule: { type: 'daily' }, archived: false, order: 1 } as Habit));
    expect(await hasUserData()).toBe(true);
  });
  it('версия запоминается', async () => {
    expect(await metaRepo.get<string>('lastSeenVersion')).toBeUndefined();
    await metaRepo.set('lastSeenVersion', '0.3.0');
    expect(await metaRepo.get<string>('lastSeenVersion')).toBe('0.3.0');
  });
});
