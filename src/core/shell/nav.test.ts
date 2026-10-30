import { describe, expect, it } from 'vitest';
import type { ModuleNavItem } from '../module';
import { mobileItems } from './nav';

const item = (to: string): ModuleNavItem => ({ to, label: to, short: to, icon: 'star', accent: '' });
const planner = { nav: [item('/day'), item('/backlog'), item('/habits'), item('/stats')] };
const gym = { nav: [item('/gym')] };
const paths = (xs: ModuleNavItem[]) => xs.map((x) => x.to);

describe('нижнее меню телефона', () => {
  it('«Сводка», выбранные разделы в выбранном порядке и «Ещё»', () => {
    expect(paths(mobileItems([planner, gym], ['/gym', '/day', '/stats']))).toEqual(['/', '/gym', '/day', '/stats', '/more']);
  });
  it('не больше трёх разделов', () => {
    expect(paths(mobileItems([planner, gym], ['/day', '/backlog', '/habits', '/stats']))).toHaveLength(5);
  });
  it('пункт выключенного раздела пропадает, ничем не заменяясь', () => {
    expect(paths(mobileItems([planner], ['/gym', '/day']))).toEqual(['/', '/day', '/more']);
  });
  it('ничего не выбрано — только «Сводка» и «Ещё»', () => {
    expect(paths(mobileItems([planner, gym], []))).toEqual(['/', '/more']);
  });
});
