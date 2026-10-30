import { describe, expect, it } from 'vitest';
import { formatDateDay, formatDateLong } from './dates';

describe('форматы даты', () => {
  it('длинный: число, месяц, день недели', () => {
    expect(formatDateLong('2026-10-30')).toBe('30 октября, пятница');
  });
  it('короткий для шапки дня: день недели, число, месяц', () => {
    expect(formatDateDay('2026-10-30')).toBe('Пт, 30 октября');
    expect(formatDateDay('2026-11-02')).toBe('Пн, 2 ноября');
  });
});
