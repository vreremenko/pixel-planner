/*
 * Действия помощника в тренировках: упражнения, записанные тренировки, программа по дням.
 * Тренировку нейросеть записывает целиком, уже сделанной («жим 3×10 по 60, подтягивания 3×8»);
 * если в приложении сейчас идёт тренировка, подходы дописываются в неё.
 */
import { toInstant } from '../core/domain/dates';
import type { Weekday } from '../core/domain/types';
import { searchFoods } from '../modules/food/domain/logic';
import { CATALOG } from '../modules/gym/domain/catalog';
import { bestSet, daysLabel, e1rm, formatSet } from '../modules/gym/domain/logic';
import { MUSCLES, MUSCLE_IDS, type MuscleId } from '../modules/gym/domain/muscles';
import { GROUPS, type CustomExercise, type ExerciseDef, type GymPrefs, type ExerciseGroup, type Program, type ProgramItem, type Tracking, type Workout, type WorkoutSet } from '../modules/gym/domain/types';
import { DEFAULT_WEIGHT_STEP, kgText, suggestWeight } from '../modules/gym/domain/progression';
import { TRACKINGS, TRACKING_IDS, cleanItem, programTarget } from '../modules/gym/domain/tracking';
import type { AccountData } from './data';
import { ONLY_ON_REQUEST, ToolError, date, dateSchema, daysSchema, meta, norm, num, optText, text, weekdays, type Tool, type ToolContext } from './toolkit';

const TRACKING = Object.fromEntries(TRACKING_IDS.map((t) => [t, TRACKINGS[t].label.toLowerCase()])) as Record<Tracking, string>;
const GROUP_IDS = Object.keys(GROUPS) as ExerciseGroup[];

function exercises(data: AccountData): ExerciseDef[] {
  const own = data.all<CustomExercise>('gym_exercises').map((c): ExerciseDef => ({ ...c, custom: true }));
  return [...CATALOG, ...own];
}

/** Упражнение по id или названию: точное, иначе единственное, где есть все слова запроса. */
function findExercise(list: readonly ExerciseDef[], query: unknown): ExerciseDef {
  const q = text(query, 'exercise', 120);
  const byId = list.find((e) => e.id === q);
  if (byId) return byId;
  const exact = list.find((e) => norm(e.name) === norm(q));
  if (exact) return exact;
  const found = searchFoods(list, q, 8);
  if (found.length === 1 && found[0]) return found[0];
  if (!found.length) throw new ToolError(`Не нашёл упражнение «${q}». Посмотрите find_exercise или создайте своё через add_exercise.`);
  throw new ToolError(`Под «${q}» подходит несколько: ${found.map((e) => e.name).join(', ')}. Уточните.`);
}

const exerciseLine = (e: ExerciseDef) =>
  `${e.name} [id: ${e.id}] — ${GROUPS[e.group]}, ${TRACKING[e.tracking]}; мышцы: ${e.primary.map((m) => MUSCLES[m].label.toLowerCase()).join(', ')}${e.custom ? ' (своё)' : ''}`;

/** Подходы тренировки по упражнениям: «Жим лёжа: 60 × 10, 60 × 8». */
function workoutLines(w: Workout, sets: readonly WorkoutSet[], defOf: (id: string) => ExerciseDef | undefined): string[] {
  const mine = sets.filter((s) => s.workoutId === w.id && s.done).sort((a, b) => a.order - b.order);
  const ids = [...new Set(mine.map((s) => s.exerciseId))];
  return ids.map((id) => {
    const def = defOf(id);
    return `  ${def?.name ?? 'Упражнение удалено'}: ${mine
      .filter((s) => s.exerciseId === id)
      .map((s) => formatSet(s, def?.tracking ?? 'weight_reps'))
      .join(', ')}`;
  });
}

const minutes = (w: Workout) => (w.finishedAt ? Math.max(0, Math.round((w.finishedAt - w.startedAt) / 60_000)) : null);

/** Разбор подхода от нейросети по типу записи упражнения. */
function parseSet(raw: unknown, def: ExerciseDef): Partial<WorkoutSet> {
  if (typeof raw !== 'object' || raw === null) throw new ToolError(`${def.name}: подход — объект вида {"weight": 60, "reps": 10}`);
  const s = raw as Record<string, unknown>;
  const opt = (k: string, min: number, max: number) => (s[k] === undefined ? undefined : num(s[k], k, min, max));
  const weight = opt('weight', 0, 1000);
  const reps = opt('reps', 1, 1000);
  const durationSec = opt('duration_sec', 1, 86_400);
  const km = opt('distance_km', 0.01, 1000);
  const need = (ok: boolean, what: string) => {
    if (!ok) throw new ToolError(`${def.name} (${TRACKING[def.tracking]}): в подходе нужно ${what}`);
  };
  switch (def.tracking) {
    case 'weight_reps':
      need(reps !== undefined, 'reps (и weight, если с весом)');
      break;
    case 'reps':
      need(reps !== undefined, 'reps');
      break;
    case 'time':
      need(durationSec !== undefined, 'duration_sec');
      break;
    case 'distance_time':
      need(km !== undefined, 'distance_km (и duration_sec)');
      break;
  }
  return {
    ...(weight !== undefined ? { weight } : {}),
    ...(reps !== undefined ? { reps: Math.round(reps) } : {}),
    ...(durationSec !== undefined ? { durationSec: Math.round(durationSec) } : {}),
    ...(km !== undefined ? { distanceM: Math.round(km * 1000) } : {}),
  };
}

function findProgram(data: AccountData, query: unknown): Program {
  const q = text(query, 'program', 120);
  const list = data.all<Program>('gym_programs');
  const p = list.find((x) => x.id === q) ?? list.find((x) => norm(x.name) === norm(q)) ?? (list.filter((x) => norm(x.name).includes(norm(q))).length === 1 ? list.find((x) => norm(x.name).includes(norm(q))) : undefined);
  if (!p) throw new ToolError(`Не нашёл день программы «${q}». Есть: ${list.map((x) => x.name).join(', ') || 'ничего'}`);
  return p;
}

const programLines = (p: Program, defOf: (id: string) => ExerciseDef | undefined) => [
  `${p.name} [id: ${p.id}] — ${daysLabel(p.days)}`,
  ...p.items.map((i) => `  ${defOf(i.exerciseId)?.name ?? 'Упражнение удалено'}: ${programTarget(i, defOf(i.exerciseId)?.tracking ?? 'weight_reps')}${i.restSec ? `, отдых ${String(i.restSec)} с` : ''}`),
];

const setSchema = {
  type: 'object',
  properties: { weight: { type: 'number', description: 'кг' }, reps: { type: 'number' }, duration_sec: { type: 'number' }, distance_km: { type: 'number' } },
  additionalProperties: false,
};
const muscleSchema = { type: 'array', items: { type: 'string', enum: [...MUSCLE_IDS] } };
const muscleHelp = MUSCLE_IDS.map((m) => `${m} — ${MUSCLES[m].label.toLowerCase()}`).join(', ');

export const GYM_TOOLS: readonly Tool[] = [
  {
    name: 'find_exercise',
    title: 'Найти упражнение',
    description: 'Найти упражнение в справочнике и своих упражнениях: по названию и/или группе. Возвращает id, тип записи подходов и мышцы.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, group: { type: 'string', enum: GROUP_IDS } }, additionalProperties: false },
    readOnly: true,
    run: (data, input) => {
      const q = optText(input.query, 80);
      const group = GROUP_IDS.find((g) => g === input.group);
      let list = exercises(data).filter((e) => !group || e.group === group);
      if (q) list = searchFoods(list, q, 30);
      if (!q && !group) return `Укажите query или group (${GROUP_IDS.map((g) => `${g} — ${GROUPS[g]}`).join(', ')}).`;
      return list.length ? list.slice(0, 30).map(exerciseLine).join('\n') : 'Ничего не нашёл. Можно создать своё упражнение через add_exercise.';
    },
  },
  {
    name: 'get_workouts',
    title: 'Тренировки',
    description: 'Последние тренировки с подходами, или история одного упражнения (exercise) с лучшим подходом. id тренировок — для delete_workout.',
    inputSchema: { type: 'object', properties: { limit: { type: 'number', description: 'Сколько последних, по умолчанию 5' }, exercise: { type: 'string', description: 'Название или id упражнения' } }, additionalProperties: false },
    readOnly: true,
    run: (data, input) => {
      const list = exercises(data);
      const defOf = (id: string) => list.find((e) => e.id === id);
      const workouts = data.all<Workout>('gym_workouts').sort((a, b) => b.startedAt - a.startedAt);
      const sets = data.all<WorkoutSet>('gym_sets');
      const limit = input.limit === undefined ? 5 : Math.round(num(input.limit, 'limit', 1, 50));
      if (input.exercise !== undefined) {
        const def = findExercise(list, input.exercise);
        const mine = sets.filter((s) => s.exerciseId === def.id && s.done);
        const sessions = workouts.filter((w) => mine.some((s) => s.workoutId === w.id)).slice(0, limit);
        if (!sessions.length) return `«${def.name}» ещё не делали.`;
        const best = bestSet(mine, def.tracking);
        const rm = best ? e1rm(best.weight, best.reps) : null;
        // Подсказка прогрессии: последний раз все рабочие подходы дошли до верха диапазона программы
        const target = data.all<Program>('gym_programs').flatMap((p) => p.items).find((it) => it.exerciseId === def.id)?.reps;
        const lastSets = sessions[0] ? mine.filter((s) => s.workoutId === sessions[0]?.id) : [];
        const step = data.all<GymPrefs>('gym_prefs')[0]?.weightSteps?.[def.id] ?? DEFAULT_WEIGHT_STEP;
        const tip = def.tracking === 'weight_reps' ? suggestWeight(lastSets, target, def.group, step) : null;
        return [
          `${def.name}${best ? `, лучший подход: ${formatSet(best, def.tracking)} (${best.date})${rm && def.tracking === 'weight_reps' ? `, расчётный максимум ${String(rm)} кг` : ''}` : ''}`,
          ...sessions.map((w) => `${w.date}: ${mine.filter((s) => s.workoutId === w.id).sort((a, b) => a.order - b.order).map((s) => formatSet(s, def.tracking)).join(', ')}`),
          ...(tip ? [`Подсказка: в прошлый раз все подходы по ${String(tip.reps)} — пора ${kgText(tip.weight)} кг (+${kgText(tip.weight - tip.from)}).`] : []),
        ].join('\n');
      }
      if (!workouts.length) return 'Тренировок пока нет.';
      return workouts
        .slice(0, limit)
        .map((w) => {
          const mins = minutes(w);
          const lines = workoutLines(w, sets, defOf);
          return [`${w.date} · ${w.title}${w.finishedAt ? (mins ? ` · ${String(mins)} мин` : '') : ' · идёт сейчас'} [id: ${w.id}]`, ...(lines.length ? lines : ['  подходов не отмечено'])].join('\n');
        })
        .join('\n\n');
    },
  },
  {
    name: 'log_workout',
    title: 'Записать тренировку',
    description:
      'Записать сделанную тренировку: упражнения и подходы. Сначала find_exercise, если не уверены в названии. ' +
      'Подход: weight (кг) и reps для силовых, reps для упражнений со своим весом, duration_sec для времени, distance_km (+duration_sec) для кардио. ' +
      'Если в приложении сейчас идёт тренировка, подходы добавятся в неё.',
    inputSchema: {
      type: 'object',
      properties: {
        exercises: {
          type: 'array',
          items: { type: 'object', properties: { exercise: { type: 'string', description: 'Название или id' }, sets: { type: 'array', items: setSchema } }, required: ['exercise', 'sets'], additionalProperties: false },
        },
        date: dateSchema,
        title: { type: 'string', description: 'Название тренировки; по умолчанию — день программы или «Тренировка»' },
        program: { type: 'string', description: 'День программы, если тренировались по нему' },
        duration_min: { type: 'number', description: 'Длительность, мин' },
      },
      required: ['exercises'],
      additionalProperties: false,
    },
    readOnly: false,
    run: (data, input, ctx) => {
      const list = exercises(data);
      if (!Array.isArray(input.exercises) || input.exercises.length === 0) throw new ToolError('Нужен список exercises с подходами');
      // Сначала всё разбираем: при ошибке ничего не записываем
      const parsed = input.exercises.map((raw: unknown) => {
        const x = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
        const def = findExercise(list, x.exercise);
        if (!Array.isArray(x.sets) || x.sets.length === 0) throw new ToolError(`${def.name}: нужен хотя бы один подход`);
        if (x.sets.length > 30) throw new ToolError(`${def.name}: слишком много подходов`);
        return { def, sets: x.sets.map((s: unknown) => parseSet(s, def)) };
      });
      const d = date(input.date, ctx);
      const program = input.program === undefined ? undefined : findProgram(data, input.program);
      const active = d === ctx.today ? data.all<Workout>('gym_workouts').filter((w) => !w.finishedAt).sort((a, b) => b.startedAt - a.startedAt)[0] : undefined;
      const total = parsed.reduce((n, p) => n + p.sets.length, 0);
      let w: Workout;
      if (active) w = active;
      else {
        // Без времени — вечер выбранного дня, а для сегодня — «только что»; длительность — по 3 минуты на подход
        const mins = input.duration_min === undefined ? total * 3 : Math.round(num(input.duration_min, 'duration_min', 1, 600));
        const end = d === ctx.today ? ctx.now : toInstant(d, '19:00').getTime();
        const title = optText(input.title, 80) ?? program?.name ?? 'Тренировка';
        w = data.put<Workout>('gym_workouts', { ...meta(ctx), date: d, startedAt: end - mins * 60_000, finishedAt: end, title, ...(program ? { programId: program.id } : {}) });
      }
      const existing = data.all<WorkoutSet>('gym_sets').filter((s) => s.workoutId === w.id);
      let order = existing.reduce((m, s) => Math.max(m, s.order), 0);
      for (const p of parsed) for (const s of p.sets) data.put<WorkoutSet>('gym_sets', { ...meta(ctx), workoutId: w.id, exerciseId: p.def.id, date: w.date, order: ++order, done: true, ...s });
      const lines = parsed.map((p) => `  ${p.def.name}: ${p.sets.map((s) => formatSet(s, p.def.tracking)).join(', ')}`);
      return [`${active ? 'Добавил в идущую тренировку' : 'Записал тренировку'} «${w.title}» ${w.date} (${String(total)} подх.):`, ...lines].join('\n');
    },
  },
  {
    name: 'delete_workout',
    title: 'Удалить тренировку',
    description: 'Удалить тренировку со всеми подходами. id — из get_workouts.' + ONLY_ON_REQUEST,
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
    readOnly: false,
    destructive: true,
    run: (data, input, ctx) => {
      const w = data.get<Workout>('gym_workouts', text(input.id, 'id', 200));
      if (!w) throw new ToolError('Тренировка не найдена. Возьмите id из get_workouts.');
      for (const s of data.all<WorkoutSet>('gym_sets').filter((x) => x.workoutId === w.id)) data.put('gym_sets', { ...s, deletedAt: ctx.now, updatedAt: ctx.now });
      data.put('gym_workouts', { ...w, deletedAt: ctx.now, updatedAt: ctx.now });
      return `Удалил тренировку «${w.title}» ${w.date}.`;
    },
  },
  {
    name: 'list_programs',
    title: 'Программа тренировок',
    description: 'Дни программы: расписание по дням недели и упражнения с подходами, повторами и весом.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    readOnly: true,
    run: (data) => {
      const list = exercises(data);
      const programs = data.all<Program>('gym_programs').sort((a, b) => a.order - b.order);
      return programs.length ? programs.map((p) => programLines(p, (id) => list.find((e) => e.id === id)).join('\n')).join('\n\n') : 'Программы пока нет.';
    },
  },
  {
    name: 'save_program',
    title: 'Сохранить день программы',
    description:
      'Создать день программы («Грудь + трицепс») или переписать существующий (program — его название или id). ' +
      'Переданные exercises заменяют весь список упражнений дня. Цели — по типу упражнения: reps и weight для силовых, reps для своего веса, ' +
      'duration_sec для упражнений на время, distance_km и duration_sec для кардио. Менять существующий — только по просьбе пользователя.',
    inputSchema: {
      type: 'object',
      properties: {
        program: { type: 'string', description: 'Существующий день, если меняем' },
        name: { type: 'string', description: 'Название дня' },
        days: daysSchema,
        exercises: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              exercise: { type: 'string' },
              sets: { type: 'number' },
              reps: { type: 'string', description: '«8–12» или «10»' },
              weight: { type: 'number', description: 'кг' },
              duration_sec: { type: 'number' },
              distance_km: { type: 'number' },
              rest_sec: { type: 'number' },
            },
            required: ['exercise', 'sets'],
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
    readOnly: false,
    run: (data, input, ctx) => {
      const list = exercises(data);
      const cur = input.program === undefined ? undefined : findProgram(data, input.program);
      const name = input.name === undefined ? cur?.name : text(input.name, 'name', 80);
      if (!name) throw new ToolError('Нужно название дня программы (name)');
      let items: ProgramItem[] | undefined = cur?.items;
      if (input.exercises !== undefined) {
        if (!Array.isArray(input.exercises)) throw new ToolError('exercises — список');
        items = input.exercises.map((raw: unknown) => {
          const x = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
          const def = findExercise(list, x.exercise);
          const reps = typeof x.reps === 'number' ? String(x.reps) : optText(x.reps, 20);
          // Лишние для типа упражнения цели (повторы у планки) отбрасываются
          return cleanItem(
            {
              exerciseId: def.id,
              sets: Math.round(num(x.sets, 'sets', 1, 20)),
              ...(reps ? { reps } : {}),
              ...(x.weight !== undefined ? { weight: num(x.weight, 'weight', 0, 1000) } : {}),
              ...(x.duration_sec !== undefined ? { durationSec: Math.round(num(x.duration_sec, 'duration_sec', 1, 86_400)) } : {}),
              ...(x.distance_km !== undefined ? { distanceM: Math.round(num(x.distance_km, 'distance_km', 0.01, 1000) * 1000) } : {}),
              ...(x.rest_sec !== undefined ? { restSec: Math.round(num(x.rest_sec, 'rest_sec', 0, 1800)) } : {}),
            },
            def.tracking,
          );
        });
      }
      if (!items?.length) throw new ToolError('Нужен список exercises');
      const days: Weekday[] | undefined = input.days === undefined ? cur?.days : weekdays(input.days);
      const order = cur?.order ?? data.all<Program>('gym_programs').reduce((m, p) => Math.max(m, p.order), 0) + 1;
      const { days: _d, ...base } = cur ?? { ...meta(ctx), name, order, items };
      const p = data.put<Program>('gym_programs', { ...base, name, order, items, updatedAt: ctx.now, ...(days?.length ? { days } : {}) });
      return [`${cur ? 'Обновил' : 'Создал'} день программы:`, ...programLines(p, (id) => list.find((e) => e.id === id))].join('\n');
    },
  },
  {
    name: 'delete_program',
    title: 'Удалить день программы',
    description: 'Удалить день программы. Записанные тренировки останутся.' + ONLY_ON_REQUEST,
    inputSchema: { type: 'object', properties: { program: { type: 'string', description: 'Название или id' } }, required: ['program'], additionalProperties: false },
    readOnly: false,
    destructive: true,
    run: (data, input, ctx) => {
      const p = findProgram(data, input.program);
      data.put('gym_programs', { ...p, deletedAt: ctx.now, updatedAt: ctx.now });
      return `Удалил день программы «${p.name}».`;
    },
  },
  {
    name: 'add_exercise',
    title: 'Своё упражнение',
    description: `Создать своё упражнение, если в справочнике нет. Мышцы: ${muscleHelp}.`,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        group: { type: 'string', enum: GROUP_IDS, description: GROUP_IDS.map((g) => `${g} — ${GROUPS[g]}`).join(', ') },
        primary: { ...muscleSchema, description: 'Основные мышцы' },
        secondary: { ...muscleSchema, description: 'Вспомогательные мышцы' },
        tracking: { type: 'string', enum: Object.keys(TRACKING), description: Object.entries(TRACKING).map(([k, v]) => `${k} — ${v}`).join(', ') },
        technique: { type: 'array', items: { type: 'string' }, description: 'Короткие пункты техники' },
      },
      required: ['name', 'group', 'primary'],
      additionalProperties: false,
    },
    readOnly: false,
    run: (data, input, ctx) => {
      const name = text(input.name, 'name', 80);
      if (exercises(data).some((e) => norm(e.name) === norm(name))) throw new ToolError(`Упражнение «${name}» уже есть.`);
      const group = GROUP_IDS.find((g) => g === input.group);
      if (!group) throw new ToolError(`group: ${GROUP_IDS.join(', ')}`);
      const muscles = (v: unknown): MuscleId[] => (Array.isArray(v) ? MUSCLE_IDS.filter((m) => v.includes(m)) : []);
      const primary = muscles(input.primary);
      if (!primary.length) throw new ToolError(`primary: хотя бы одна мышца из ${MUSCLE_IDS.join(', ')}`);
      const secondary = muscles(input.secondary).filter((m) => !primary.includes(m));
      const tracking = (Object.keys(TRACKING) as Tracking[]).find((t) => t === input.tracking) ?? 'weight_reps';
      const technique = Array.isArray(input.technique) ? input.technique.filter((t): t is string => typeof t === 'string' && t.trim() !== '').map((t) => t.trim().slice(0, 200)).slice(0, 8) : [];
      const e = data.put<CustomExercise>('gym_exercises', { ...meta(ctx), name, group, primary, secondary, tracking, technique });
      return `Создал упражнение: ${exerciseLine({ ...e, custom: true })}`;
    },
  },
  {
    name: 'delete_exercise',
    title: 'Удалить своё упражнение',
    description: 'Удалить своё упражнение (из справочника удалить нельзя). Записанные подходы останутся в истории.' + ONLY_ON_REQUEST,
    inputSchema: { type: 'object', properties: { exercise: { type: 'string', description: 'Название или id' } }, required: ['exercise'], additionalProperties: false },
    readOnly: false,
    destructive: true,
    run: (data, input, ctx: ToolContext) => {
      const def = findExercise(exercises(data), input.exercise);
      const own = data.get<CustomExercise>('gym_exercises', def.id);
      if (!own) throw new ToolError(`«${def.name}» — из справочника, его удалить нельзя.`);
      data.put('gym_exercises', { ...own, deletedAt: ctx.now, updatedAt: ctx.now });
      return `Удалил упражнение «${own.name}».`;
    },
  },
];
