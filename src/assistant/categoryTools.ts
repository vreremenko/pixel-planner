/* Действия помощника с категориями доходов и расходов: список, добавить, переименовать, переставить, скрыть, вернуть. */
import { moveCategory, nextOrder, sortCategories, visibleCategories } from '../modules/finance/domain/categories';
import { DEFAULT_CATEGORIES, type Category, type CategoryKind } from '../modules/finance/domain/types';
import type { AccountData } from './data';
import { ONLY_ON_REQUEST, ToolError, meta, norm, num, optText, pick, text, type Tool } from './toolkit';

/** Все категории аккаунта (стартовые + свои, с архивными), по порядку пользователя. */
export function allCategories(data: AccountData): Category[] {
  const stored = new Map(data.all<Category>('fin_categories').map((c) => [c.id, c]));
  const defaults = DEFAULT_CATEGORIES.map((c): Category => stored.get(c.id) ?? { ...c, createdAt: 0, updatedAt: 0 });
  return sortCategories([...defaults, ...[...stored.values()].filter((c) => !c.id.startsWith('def:'))]);
}

const KIND_LABEL: Record<CategoryKind, string> = { expense: 'Расходы', income: 'Доходы' };
const kindOf = (v: unknown): CategoryKind => {
  if (v === 'expense' || v === 'income') return v;
  throw new ToolError('kind: expense (расход) или income (доход)');
};
const kindSchema = { type: 'string', enum: ['expense', 'income'], description: 'expense — расходы, income — доходы' };

export const CATEGORY_TOOLS: readonly Tool[] = [
  {
    name: 'list_categories',
    title: 'Категории',
    description: 'Категории расходов и доходов в порядке пользователя (так они стоят в приложении), и скрытые.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    readOnly: true,
    run: (data) => {
      const all = allCategories(data);
      return (['expense', 'income'] as const)
        .map((k) => {
          const hidden = all.filter((c) => c.kind === k && c.archived);
          return [`${KIND_LABEL[k]}:`, ...visibleCategories(all, k).map((c, i) => `  ${String(i + 1)}. ${c.name}`), ...(hidden.length ? [`  скрытые: ${hidden.map((c) => c.name).join(', ')}`] : [])].join('\n');
        })
        .join('\n\n');
    },
  },
  {
    name: 'add_category',
    title: 'Новая категория',
    description: 'Добавить категорию расходов или доходов (в конец списка или на position, считая с 1). Скрытую с тем же названием — вернуть.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, kind: kindSchema, position: { type: 'number' } }, required: ['name', 'kind'], additionalProperties: false },
    readOnly: false,
    run: (data, input, ctx) => {
      const name = text(input.name, 'name', 40);
      const kind = kindOf(input.kind);
      const all = allCategories(data);
      const same = all.find((c) => c.kind === kind && norm(c.name) === norm(name));
      if (same && !same.archived) throw new ToolError(`Категория «${same.name}» уже есть.`);
      const row = data.put<Category>('fin_categories', same ? { ...same, archived: false, order: nextOrder(all, kind), updatedAt: ctx.now } : { ...meta(ctx), name, kind, order: nextOrder(all, kind) });
      if (input.position !== undefined) for (const c of moveCategory(allCategories(data), row.id, Math.round(num(input.position, 'position', 1, 100)) - 1)) data.put('fin_categories', { ...c, updatedAt: ctx.now });
      return `${same ? 'Вернул' : 'Добавил'} категорию ${kind === 'expense' ? 'расходов' : 'доходов'} «${row.name}».`;
    },
  },
  {
    name: 'update_category',
    title: 'Изменить категорию',
    description:
      'Переименовать категорию (name), переставить (position, считая с 1), скрыть (archived: true) или вернуть (archived: false). ' +
      'Скрытая не показывается при записи, но старые операции с ней остаются.' +
      ONLY_ON_REQUEST,
    inputSchema: {
      type: 'object',
      properties: { category: { type: 'string', description: 'Название' }, kind: { ...kindSchema, description: 'Если одинаковые названия у дохода и расхода («Другое»)' }, name: { type: 'string' }, position: { type: 'number' }, archived: { type: 'boolean' } },
      required: ['category'],
      additionalProperties: false,
    },
    readOnly: false,
    destructive: true,
    run: (data, input, ctx) => {
      const kind = input.kind === undefined ? undefined : kindOf(input.kind);
      const all = allCategories(data).filter((c) => !kind || c.kind === kind);
      const cur = pick(all, text(input.category, 'category', 40), (c) => c.name, 'категорию');
      let next: Category = { ...cur, updatedAt: ctx.now };
      const name = optText(input.name, 40);
      if (name) {
        if (allCategories(data).some((c) => c.id !== cur.id && c.kind === cur.kind && !c.archived && norm(c.name) === norm(name))) throw new ToolError(`Категория «${name}» уже есть.`);
        next.name = name;
      }
      if (input.archived === true) next.archived = true;
      if (input.archived === false && cur.archived) next = { ...next, archived: false, order: nextOrder(allCategories(data), cur.kind) };
      data.put('fin_categories', next);
      if (input.position !== undefined && !next.archived) for (const c of moveCategory(allCategories(data), cur.id, Math.round(num(input.position, 'position', 1, 100)) - 1)) data.put('fin_categories', { ...c, updatedAt: ctx.now });
      const pos = visibleCategories(allCategories(data), cur.kind).findIndex((c) => c.id === cur.id);
      return `«${next.name}»: ${next.archived ? 'скрыта' : `${String(pos + 1)}-я в ${cur.kind === 'expense' ? 'расходах' : 'доходах'}`}.`;
    },
  },
];
