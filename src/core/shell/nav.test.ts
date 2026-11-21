import { describe, expect, it } from 'vitest';
import type { ModuleNavItem } from '../module';
import { mobileItems } from './nav';

const item = (to: string): ModuleNavItem => ({ to, label: to, short: to, icon: 'star', accent: '' });
const planner = { nav: [item('/day'), item('/backlog'), item('/habits'), item('/stats')] };
const gym = { nav: [item('/gym')] };
const paths = (xs: ModuleNavItem[]) => xs.map((x) => x.to);

describe('нижнее меню телефона', () => {
  it('«Сводка» и выбранные разделы в выбранном порядке, не больше двух', () => {
    expect(paths(mobileItems([planner, gym], ['/gym', '/day', '/stats']))).toEqual(['/', '/gym', '/day']);
  });
  it('пункт выключенного раздела пропадает, ничем не заменяясь', () => {
    expect(paths(mobileItems([planner], ['/gym', '/day']))).toEqual(['/', '/day']);
  });
  it('ничего не выбрано — только «Сводка»', () => {
    expect(paths(mobileItems([planner, gym], []))).toEqual(['/']);
  });
});
