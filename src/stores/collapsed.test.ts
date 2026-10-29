// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'pixel-planner:collapsed';

async function freshStore() {
  vi.resetModules();
  return import('./collapsed');
}

describe('свёрнутые блоки', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('по умолчанию всё развёрнуто', async () => {
    const { useCollapsed } = await freshStore();
    expect(useCollapsed.getState().collapsed).toEqual({});
  });

  it('toggle сворачивает и разворачивает, состояние сохраняется между запусками', async () => {
    const first = await freshStore();
    first.useCollapsed.getState().toggle('habit:1');
    expect(first.useCollapsed.getState().collapsed['habit:1']).toBe(true);
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}')).toEqual({ 'habit:1': true });

    const second = await freshStore(); // «перезапуск»
    expect(second.useCollapsed.getState().collapsed['habit:1']).toBe(true);
    second.useCollapsed.getState().toggle('habit:1');
    expect(second.useCollapsed.getState().collapsed).toEqual({});
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({});
  });

  it('setMany: свернуть и развернуть всё разом', async () => {
    const { useCollapsed } = await freshStore();
    useCollapsed.getState().setMany(['a', 'b', 'c'], true);
    expect(Object.keys(useCollapsed.getState().collapsed).sort()).toEqual(['a', 'b', 'c']);
    useCollapsed.getState().setMany(['a', 'c'], false);
    expect(Object.keys(useCollapsed.getState().collapsed)).toEqual(['b']);
  });

  it('повреждённое или чужое содержимое не ломает приложение', async () => {
    localStorage.setItem(KEY, '{не json');
    expect((await freshStore()).useCollapsed.getState().collapsed).toEqual({});
    localStorage.setItem(KEY, JSON.stringify({ x: true, y: false, z: 'да', n: 1 }));
    expect((await freshStore()).useCollapsed.getState().collapsed).toEqual({ x: true });
    localStorage.setItem(KEY, '[1,2]');
    expect(Object.keys((await freshStore()).useCollapsed.getState().collapsed)).toEqual([]);
  });

  it('если localStorage недоступен, работает в памяти', async () => {
    const { useCollapsed } = await freshStore();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    useCollapsed.getState().toggle('habit:1');
    expect(useCollapsed.getState().collapsed['habit:1']).toBe(true);
    spy.mockRestore();
  });
});
