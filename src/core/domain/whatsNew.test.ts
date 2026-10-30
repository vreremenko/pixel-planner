import { describe, expect, it } from 'vitest';
import { entriesToShow, compareVersions, MAX_SHOWN } from './whatsNew';
import type { ChangelogEntry } from '../changelog';

const e = (version: string): ChangelogEntry => ({ version, date: '2026-01-01', title: `v${version}`, items: ['x'] });
const log = [e('0.4.0'), e('0.3.0'), e('0.2.0'), e('0.1.0')];

describe('compareVersions', () => {
  it('сравнивает по числам, а не по строкам', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1);
    expect(compareVersions('0.9.0', '0.10.0')).toBe(-1);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
  });
});

describe('entriesToShow', () => {
  it('уже видел последнюю версию — ничего не показываем', () => {
    expect(entriesToShow(log, '0.4.0', true)).toEqual([]);
  });
  it('новая установка (данных нет) — не показываем', () => {
    expect(entriesToShow(log, undefined, false)).toEqual([]);
  });
  it('обновился с версии без окна «Что нового» — только последняя запись', () => {
    expect(entriesToShow(log, undefined, true).map((x) => x.version)).toEqual(['0.4.0']);
  });
  it('пропустил несколько версий — все пропущенные, от новых к старым', () => {
    expect(entriesToShow(log, '0.2.0', true).map((x) => x.version)).toEqual(['0.4.0', '0.3.0']);
    expect(entriesToShow(log, '0.3.0', true).map((x) => x.version)).toEqual(['0.4.0']);
  });
  it('не показывает больше MAX_SHOWN записей', () => {
    const many = Array.from({ length: 12 }, (_, i) => e(`0.${String(12 - i)}.0`));
    expect(entriesToShow(many, '0.0.1', true)).toHaveLength(MAX_SHOWN);
  });
  it('версия из будущего или неизвестная — ничего лишнего', () => {
    expect(entriesToShow(log, '9.9.9', true)).toEqual([]);
  });
  it('пустой журнал', () => {
    expect(entriesToShow([], '0.1.0', true)).toEqual([]);
  });
});
