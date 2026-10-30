import { describe, expect, it } from 'vitest';
import { needsReload } from './updateCheck';

describe('needsReload', () => {
  it('перезагружаем, когда на сервере другая сборка', () => {
    expect(needsReload('a', 'b', null)).toBe(true);
  });
  it('не перезагружаем, если сборка та же или сервер не ответил', () => {
    expect(needsReload('a', 'a', null)).toBe(false);
    expect(needsReload('a', null, null)).toBe(false);
  });
  it('не перезагружаемся второй раз ради той же сборки', () => {
    expect(needsReload('a', 'b', 'b')).toBe(false);
    expect(needsReload('a', 'c', 'b')).toBe(true);
  });
});
