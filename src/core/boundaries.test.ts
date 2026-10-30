/*
 * Границы модулей: ядро не знает о внутренностях разделов (только реестры src/modules/*.ts),
 * разделы не импортируют друг друга, src/shared — ни ядро, ни разделы (его собирает и сервер).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRIES = new Set(['modules/index', 'modules/tables', 'modules/reminders']);

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

/** Относительные импорты файла как пути от src без расширения. */
function imports(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  return [...src.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g)].map((m) =>
    relative(SRC, normalize(join(dirname(file), m[1] ?? ''))).replace(/\.(tsx?|css)$/, ''),
  );
}

const area = (p: string) => (p.startsWith('modules/') ? (p.split('/').length > 2 ? `module:${p.split('/')[1] ?? ''}` : 'registry') : (p.split('/')[0] ?? ''));

describe('границы модулей', () => {
  const all = files(SRC).map((f) => ({ from: relative(SRC, f), deps: imports(f) }));

  it('ядро обращается к разделам только через реестры', () => {
    const bad = all
      .filter((f) => f.from.startsWith('core/'))
      .flatMap((f) => f.deps.filter((d) => d.startsWith('modules/') && !REGISTRIES.has(d)).map((d) => `${f.from} → ${d}`));
    expect(bad).toEqual([]);
  });

  it('разделы не импортируют друг друга и реестры', () => {
    const bad = all
      .filter((f) => area(f.from).startsWith('module:'))
      .flatMap((f) => f.deps.filter((d) => d.startsWith('modules/') && area(d) !== area(f.from)).map((d) => `${f.from} → ${d}`));
    expect(bad).toEqual([]);
  });

  it('src/shared ни от чего не зависит', () => {
    const bad = all.filter((f) => f.from.startsWith('shared/')).flatMap((f) => f.deps.filter((d) => !d.startsWith('shared/')).map((d) => `${f.from} → ${d}`));
    expect(bad).toEqual([]);
  });
});
