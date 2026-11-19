/*
 * Норма калорий, которая подстраивается под вес. Раз в неделю, небольшими шагами:
 *  - есть записи питания и взвешивания за 2–3 недели — считаем реальный расход: средние калории
 *    минус изменение веса по тренду (≈ 7700 ккал на кг), и от него — норму под цель;
 *  - записей питания мало, но вес изменился — пересчитываем по формуле с новым весом.
 * Шаг не больше 150 ккал за раз и никогда не ниже базового обмена: норма не «скачет» от одного взвешивания.
 */
import { addDays, diffDays } from '../../../core/domain/dates';
import type { LocalDate } from '../../../core/domain/types';
import { GOAL_FACTOR, bmr, calcGoal, macrosFor } from './logic';
import type { FoodEntry, Macros, Profile } from './types';

const WINDOW_DAYS = 21;
/** Сколько дней с записями питания нужно, чтобы доверять подсчёту расхода. */
const MIN_FOOD_DAYS = 10;
/** День с меньшим числом калорий, скорее всего, записан не полностью — его не считаем. */
const MIN_DAY_KCAL = 800;
const MIN_WEIGHINS = 3;
const MIN_WEIGHT_SPAN = 10;
const KCAL_PER_KG = 7700;
const MAX_STEP = 150;
const MIN_CHANGE = 50;
const EVERY_DAYS = 7;

export interface WeightPoint {
  date: LocalDate;
  value: number;
}

export interface AdaptInput {
  profile: Profile;
  goal: Macros;
  entries: readonly FoodEntry[];
  weights: readonly WeightPoint[];
  today: LocalDate;
  adaptedAt?: LocalDate | undefined;
}

export interface Adaptation {
  goal: Macros;
  profile: Profile;
  note: string;
}

/** Наклон прямой по точкам (кг в день), метод наименьших квадратов. */
export function trendPerDay(points: readonly WeightPoint[]): number {
  const first = points[0];
  if (!first || points.length < 2) return 0;
  const xs = points.map((p) => diffDays(p.date, first.date));
  const mx = xs.reduce((a, x) => a + x, 0) / xs.length;
  const my = points.reduce((a, p) => a + p.value, 0) / points.length;
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  return den === 0 ? 0 : xs.reduce((a, x, i) => a + (x - mx) * ((points[i]?.value ?? my) - my), 0) / den;
}

const kgText = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
const kcalText = (n: number) => Math.round(n).toLocaleString('ru-RU');
const round10 = (n: number) => Math.round(n / 10) * 10;

/** Новая норма или null, если подстраивать пока не нужно (рано, мало данных, разница мала). */
export function adaptGoal(x: AdaptInput): Adaptation | null {
  if (x.adaptedAt && diffDays(x.today, x.adaptedAt) < EVERY_DAYS) return null;
  const end = addDays(x.today, -1);
  const start = addDays(end, -(WINDOW_DAYS - 1));
  const weights = [...x.weights].filter((w) => w.date >= start && w.date <= end).sort((a, b) => (a.date < b.date ? -1 : 1));
  const latest = [...x.weights].filter((w) => w.date <= x.today).sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1);
  // Вес в профиле — по последнему замеру: от него считаются обмен, белок и жиры
  const profile: Profile = latest && Math.abs(latest.value - x.profile.weight) >= 0.3 ? { ...x.profile, weight: Math.round(latest.value * 10) / 10 } : x.profile;

  const perDay = new Map<string, number>();
  for (const e of x.entries) if (e.date >= start && e.date <= end) perDay.set(e.date, (perDay.get(e.date) ?? 0) + (e.kcal * e.grams) / 100);
  const days = [...perDay.values()].filter((k) => k >= MIN_DAY_KCAL);
  const span = weights.length ? diffDays(weights.at(-1)?.date ?? end, weights[0]?.date ?? end) : 0;

  let target: number;
  let why: string;
  if (days.length >= MIN_FOOD_DAYS && weights.length >= MIN_WEIGHINS && span >= MIN_WEIGHT_SPAN) {
    const intake = days.reduce((a, k) => a + k, 0) / days.length;
    const slope = trendPerDay(weights);
    const expenditure = intake - slope * KCAL_PER_KG;
    if (expenditure < 1000 || expenditure > 6000) return null;
    target = expenditure * GOAL_FACTOR[profile.goal];
    const change = slope * 7;
    const trend = Math.abs(change) < 0.05 ? 'вес почти не меняется' : `вес ${change > 0 ? '+' : '−'}${kgText(Math.abs(change))} кг в неделю`;
    why = `расход по вашим данным ≈ ${kcalText(round10(expenditure))} ккал: в среднем ${kcalText(round10(intake))} ккал в день, ${trend}`;
  } else if (profile.weight !== x.profile.weight) {
    target = calcGoal(profile).kcal;
    why = `вес ${kgText(x.profile.weight)} → ${kgText(profile.weight)} кг, норма пересчитана по формуле (для точной подстройки записывайте еду и взвешивайтесь)`;
  } else {
    return null;
  }

  const floor = round10(bmr(profile) * 1.1);
  const diff = Math.max(-MAX_STEP, Math.min(MAX_STEP, target - x.goal.kcal));
  const kcal = Math.max(floor, round10(x.goal.kcal + diff));
  if (Math.abs(kcal - x.goal.kcal) < MIN_CHANGE) {
    // Норма почти та же — обновим только вес в профиле
    return profile.weight !== x.profile.weight ? { goal: macrosFor(x.goal.kcal, profile.weight, profile.goal), profile, note: `Вес в профиле обновлён: ${kgText(profile.weight)} кг, норма прежняя` } : null;
  }
  return {
    goal: macrosFor(kcal, profile.weight, profile.goal),
    profile,
    note: `Норма ${kcalText(x.goal.kcal)} → ${kcalText(kcal)} ккал: ${why}.${Math.abs(target - x.goal.kcal) > MAX_STEP ? ' Меняем постепенно, не больше 150 ккал в неделю.' : ''}`,
  };
}
