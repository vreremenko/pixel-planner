import { describe, expect, it } from 'vitest';
import { byListOrder } from './order';
import type { Task } from './types';

const t = (id: string, order: number, createdAt: number) => ({ id, order, createdAt }) as Task;

describe('порядок списка задач', () => {
  it('по order, а при равенстве новые выше', () => {
    const list = [t('c', 2, 1), t('a', 0, 1), t('b', 0, 5)];
    expect(list.sort(byListOrder).map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });
});
