/*
 * Реестр готовых наборов для первого запуска: несколько привычек, программа тренировок, первый счёт.
 * Ядро (знакомство, «Начало работы») обращается к разделам только через этот файл.
 * Всё создаётся обычными записями — их можно поменять или удалить, как любые свои.
 */
import { metaRepo } from '../core/data/repo';
import { createHabit, type HabitDraft } from './planner/services/habits';
import { saveProgram } from './gym/services/programs';
import { STARTER_PROGRAMS } from './gym/domain/starter';
export { STARTER_PROGRAMS };
import { accountRepo } from './finance/data/repo';
import { toKopecks } from './finance/domain/money';

/** Что человек хочет вести — от этого зависят наборы и пункты «Начала работы». */
export type Area = 'planner' | 'gym' | 'food' | 'finance';
export const AREAS: { id: Area; title: string; hint: string; icon: string }[] = [
  { id: 'planner', title: 'Задачи и привычки', hint: 'дела на день, серии полезных привычек', icon: 'calendar' },
  { id: 'gym', title: 'Тренировки', hint: 'программа, подходы, веса, прогресс', icon: 'dumbbell' },
  { id: 'food', title: 'Питание', hint: 'калории и БЖУ, штрихкоды', icon: 'apple' },
  { id: 'finance', title: 'Финансы', hint: 'сколько можно тратить, платежи, копилки', icon: 'coin' },
];

export const STARTER_HABITS: { key: string; label: string; draft: HabitDraft }[] = [
  { key: 'water', label: 'Пить воду — 8 стаканов', draft: { name: 'Вода', icon: 'drop', schedule: { type: 'daily' }, tracking: { kind: 'count', unit: 'стаканов' } } },
  { key: 'morning', label: 'Утро без телефона', draft: { name: 'Утро без телефона', icon: 'sun', schedule: { type: 'daily' }, tracking: { kind: 'check' } } },
  { key: 'exercise', label: 'Зарядка 10 минут', draft: { name: 'Зарядка', icon: 'fire', schedule: { type: 'daily' }, tracking: { kind: 'check' } } },
  { key: 'read', label: 'Читать 10 страниц', draft: { name: 'Чтение', icon: 'book', schedule: { type: 'daily' }, tracking: { kind: 'count', unit: 'страниц' } } },
  { key: 'sleep', label: 'Лечь до 23:00', draft: { name: 'Лечь до 23:00', icon: 'moon', schedule: { type: 'daily' }, tracking: { kind: 'check' } } },
];

export interface StarterChoice {
  areas: Area[];
  habits: string[];
  program: string | null;
  /** Сколько сейчас на карте, текстом из поля; пусто — счёт не создаём. */
  money: string;
}

export async function applyStarter(c: StarterChoice): Promise<void> {
  for (const h of STARTER_HABITS) if (c.habits.includes(h.key)) await createHabit(h.draft);
  const program = STARTER_PROGRAMS.find((p) => p.key === c.program);
  if (program) await saveProgram({ name: program.name, items: program.items, days: [0, 2, 4] });
  const money = c.money.trim() ? toKopecks(c.money) : null;
  if (money !== null) await accountRepo.save({ name: 'Карта', start: money, inPlan: true });
  await metaRepo.set(AREAS_KEY, c.areas);
  await metaRepo.set(ONBOARDED_KEY, true);
}

export const ONBOARDED_KEY = 'onboarded';
export const AREAS_KEY = 'onboardingAreas';
export const GETTING_STARTED_HIDDEN = 'gettingStartedHidden';
