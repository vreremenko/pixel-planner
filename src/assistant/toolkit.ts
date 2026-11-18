/*
 * Общее для действий помощника: типы, понятные ошибки и разбор параметров от нейросети.
 */
import { addDays } from '../core/domain/dates';
import type { LocalDate, SyncMeta } from '../core/domain/types';
import type { AccountData } from './data';

export interface ToolContext {
  now: number;
  today: LocalDate;
  newId: () => string;
}

export interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties: false };
  /** Только читает данные. */
  readOnly: boolean;
  /** Удаляет или переписывает существующее: вызывать только по прямой просьбе пользователя. */
  destructive?: boolean;
  run: (data: AccountData, input: Record<string, unknown>, ctx: ToolContext) => string;
}

/** Понятная пользователю ошибка: вызывающий показывает её текст как ответ инструмента. */
export class ToolError extends Error {}

// ---------- разбор параметров ----------

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const text = (v: unknown, name: string, max = 300): string => {
  if (typeof v !== 'string' || !v.trim()) throw new ToolError(`Нужен параметр ${name}`);
  return v.trim().slice(0, max);
};
export const optText = (v: unknown, max = 300): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
export const num = (v: unknown, name: string, min: number, max: number): number => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new ToolError(`${name}: нужно число от ${String(min)} до ${String(max)}`);
  return n;
};
/** «today», «tomorrow», «yesterday» или ГГГГ-ММ-ДД. */
export function date(v: unknown, ctx: ToolContext): LocalDate {
  if (v === undefined || v === null || v === '' || v === 'today') return ctx.today;
  if (v === 'tomorrow') return addDays(ctx.today, 1);
  if (v === 'yesterday') return addDays(ctx.today, -1);
  if (typeof v === 'string' && DATE_RE.test(v)) return v;
  throw new ToolError('Дата: today, tomorrow, yesterday или ГГГГ-ММ-ДД');
}
export const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').trim();
export const dateSchema = { type: 'string', description: 'today, tomorrow, yesterday или дата ГГГГ-ММ-ДД; по умолчанию сегодня' };
export const meta = (ctx: ToolContext): SyncMeta => ({ id: ctx.newId(), createdAt: ctx.now, updatedAt: ctx.now });

/** Найти запись по названию: точное совпадение, иначе единственное частичное. */
export function pick<T>(list: readonly T[], query: string, label: (x: T) => string, what: string): T {
  const q = norm(query);
  const exact = list.filter((x) => norm(label(x)) === q);
  if (exact.length === 1 && exact[0]) return exact[0];
  const part = list.filter((x) => norm(label(x)).includes(q));
  if (part.length === 1 && part[0]) return part[0];
  if (part.length === 0) throw new ToolError(`Не нашёл ${what} «${query}». Есть: ${list.map(label).slice(0, 15).join(', ') || 'ничего'}`);
  throw new ToolError(`Под «${query}» подходит несколько: ${part.map(label).slice(0, 10).join(', ')}. Уточните.`);
}

export const ONLY_ON_REQUEST = ' Только по прямой просьбе пользователя.';

/** Дни недели словами или числами (0 = Пн … 6 = Вс); пусто — каждый день. */
export const WEEKDAY_NAMES = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'] as const;
/** Начала полных названий: «понедельник», «пятница»… */
const WEEKDAY_FULL = ['пон', 'вто', 'сре', 'чет', 'пят', 'суб', 'вос'];
export function weekdays(v: unknown): (0 | 1 | 2 | 3 | 4 | 5 | 6)[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new ToolError('days: список дней, например ["пн","ср","пт"]');
  const out = new Set<0 | 1 | 2 | 3 | 4 | 5 | 6>();
  for (const x of v) {
    const w = typeof x === 'string' ? norm(x) : '';
    const i = typeof x === 'number' ? x : WEEKDAY_NAMES.findIndex((n, k) => w === n || w.startsWith(WEEKDAY_FULL[k] ?? n));
    if (!Number.isInteger(i) || i < 0 || i > 6) throw new ToolError(`Не понял день недели «${String(x)}». Можно: ${WEEKDAY_NAMES.join(', ')}`);
    out.add(i as 0 | 1 | 2 | 3 | 4 | 5 | 6);
  }
  return [...out].sort();
}
export const daysSchema = { type: 'array', items: { type: 'string', enum: [...WEEKDAY_NAMES] }, description: 'Дни недели; не указывать — каждый день' };
