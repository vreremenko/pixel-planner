import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, schema } from './db';
import { SYNC_TABLES } from '../../shared/syncTables';

describe('схема IndexedDB', () => {
  it('каждая синхронизируемая таблица есть в схеме и индексирует updatedAt', () => {
    const s = schema();
    for (const t of SYNC_TABLES) expect(s[t]?.split(',').map((x) => x.trim())).toContain('updatedAt');
  });

  // Изменилась схема? Поднимите SCHEMA_VERSION в db.ts и обновите снимок (vitest -u):
  // без новой версии браузер не создаст новые таблицы и индексы.
  it('снимок схемы и её версии', () => {
    expect({ version: SCHEMA_VERSION, schema: schema() }).toMatchInlineSnapshot(`
      {
        "schema": {
          "habitLogs": "id, habitId, date, updatedAt",
          "habits": "id, updatedAt",
          "meta": "key",
          "overrides": "id, seriesId, date, movedTo, updatedAt",
          "reminderLogs": "id, fireAt, updatedAt",
          "series": "id, updatedAt",
          "settings": "id",
          "tasks": "id, date, updatedAt",
        },
        "version": 3,
      }
    `);
  });
});
