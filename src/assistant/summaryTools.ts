/* Действия помощника: норма питания (и её подстройка под вес) и итоги недели по запросу. */
import { addDays, weekday } from '../core/domain/dates';
import { digestData } from '../modules/accountReminders';
import type { FoodPrefs, Macros } from '../modules/food/domain/types';
import { digestText, weekLabel } from '../modules/weeklyDigest';
import { ONLY_ON_REQUEST, ToolError, date, dateSchema, num, type Tool } from './toolkit';

const macroText = (m: Macros) => `${String(m.kcal)} ккал, Б${String(m.protein)} Ж${String(m.fat)} У${String(m.carbs)}`;

export const SUMMARY_TOOLS: readonly Tool[] = [
  {
    name: 'week_summary',
    title: 'Итоги недели',
    description: 'Итоги недели (пн–вс): задачи, привычки, деньги, тренировки, питание, вес. По умолчанию — текущая неделя.',
    inputSchema: { type: 'object', properties: { date: { ...dateSchema, description: 'Любой день нужной недели; по умолчанию сегодня' } }, additionalProperties: false },
    readOnly: true,
    run: (data, input, ctx) => {
      const d = date(input.date, ctx);
      const end = addDays(d, 6 - weekday(d));
      const text = digestText(digestData(data), end);
      return `Неделя ${weekLabel(addDays(end, -6), end)}${end > ctx.today ? ' (ещё идёт)' : ''}:\n${text || 'записей не было'}`;
    },
  },
  {
    name: 'get_food_goal',
    title: 'Норма питания',
    description: 'Норма калорий и БЖУ на день, включена ли подстройка под вес и почему норма менялась в последний раз.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    readOnly: true,
    run: (data) => {
      const p = data.all<FoodPrefs>('food_prefs')[0];
      if (!p?.goal) return 'Норма не задана. Её можно рассчитать в приложении («Питание → Цель»).';
      return [
        `Норма: ${macroText(p.goal)}`,
        `Подстройка под вес: ${p.adaptive ? 'включена' : 'выключена'}`,
        ...(p.adaptNote && p.adaptedAt ? [`Последняя подстройка ${p.adaptedAt}: ${p.adaptNote}`] : []),
        ...(p.profile ? [`Профиль: ${String(p.profile.weight)} кг, цель — ${p.profile.goal === 'lose' ? 'похудеть' : p.profile.goal === 'gain' ? 'набрать' : 'держать вес'}`] : []),
      ].join('\n');
    },
  },
  {
    name: 'update_food_goal',
    title: 'Изменить норму питания',
    description: 'Задать норму калорий и БЖУ на день и/или включить подстройку нормы под вес (adaptive).' + ONLY_ON_REQUEST,
    inputSchema: {
      type: 'object',
      properties: { kcal: { type: 'number' }, protein: { type: 'number' }, fat: { type: 'number' }, carbs: { type: 'number' }, adaptive: { type: 'boolean' } },
      additionalProperties: false,
    },
    readOnly: false,
    destructive: true,
    run: (data, input, ctx) => {
      const cur = data.all<FoodPrefs>('food_prefs')[0] ?? { id: 'prefs', createdAt: ctx.now, updatedAt: ctx.now };
      const goal: Macros = { kcal: 0, protein: 0, fat: 0, carbs: 0, ...cur.goal };
      for (const k of ['kcal', 'protein', 'fat', 'carbs'] as const) if (input[k] !== undefined) goal[k] = Math.round(num(input[k], k, 0, k === 'kcal' ? 10_000 : 1000));
      if (goal.kcal <= 0) throw new ToolError('Нужна норма калорий (kcal)');
      if (input.adaptive === true && !cur.profile) throw new ToolError('Для подстройки нужен профиль (возраст, рост, вес) — его заполняют в приложении: «Питание → Цель».');
      const adaptive = typeof input.adaptive === 'boolean' ? input.adaptive : cur.adaptive;
      data.put<FoodPrefs>('food_prefs', { ...cur, goal, ...(adaptive === undefined ? {} : { adaptive }), updatedAt: ctx.now });
      return `Норма: ${macroText(goal)}; подстройка под вес ${adaptive ? 'включена' : 'выключена'}.`;
    },
  },
];
