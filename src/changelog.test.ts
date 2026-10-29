import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_VERSION, CHANGELOG } from './changelog';
import { compareVersions } from './domain/whatsNew';

describe('журнал изменений', () => {
  it('версии уникальны и идут от новых к старым', () => {
    for (let i = 1; i < CHANGELOG.length; i++) {
      const prev = CHANGELOG[i - 1];
      const cur = CHANGELOG[i];
      expect(prev && cur && compareVersions(prev.version, cur.version)).toBe(1);
    }
  });
  it('у каждой записи есть заголовок, корректная дата и пункты', () => {
    for (const entry of CHANGELOG) {
      expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.title.trim()).not.toBe('');
      expect(entry.items.length).toBeGreaterThan(0);
      expect(entry.items.every((x) => x.trim() !== '')).toBe(true);
    }
  });
  it('версия в package.json совпадает с последней записью (не забыли поднять версию)', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(pkg.version).toBe(APP_VERSION);
  });
});
