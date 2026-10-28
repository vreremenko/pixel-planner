export interface AchievementContext {
  tasksClosed: number;
  closedFromBacklog: number;
  backlogCount: number;
  backlogEverUsed: boolean;
  bestHabitStreak: number;
  level: number;
  perfectDays: number;
  earlyBird: boolean;
  /** Была ли неделя (Пн–Вс), где все запланированные привычки выполнены. */
  perfectHabitWeek: boolean;
  habitsCreated: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  check: (c: AchievementContext) => boolean;
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first-task', title: 'Первая кровь', description: 'Закрыть первую задачу', icon: 'sword', check: (c) => c.tasksClosed >= 1 },
  { id: 'tasks-10', title: 'Разогрев', description: 'Закрыть 10 задач', icon: 'check', check: (c) => c.tasksClosed >= 10 },
  { id: 'tasks-100', title: 'Сотня', description: 'Закрыть 100 задач', icon: 'trophy', check: (c) => c.tasksClosed >= 100 },
  { id: 'tasks-500', title: 'Легенда', description: 'Закрыть 500 задач', icon: 'crown', check: (c) => c.tasksClosed >= 500 },
  { id: 'first-habit', title: 'Новый квест', description: 'Создать первую привычку', icon: 'star', check: (c) => c.habitsCreated >= 1 },
  { id: 'streak-7', title: 'Неделя огня', description: 'Стрик привычки 7 дней', icon: 'fire', check: (c) => c.bestHabitStreak >= 7 },
  { id: 'streak-30', title: 'Железная воля', description: 'Стрик привычки 30 дней', icon: 'shield', check: (c) => c.bestHabitStreak >= 30 },
  { id: 'habit-week', title: 'Неделя без пропусков', description: 'Выполнить все квесты за неделю', icon: 'calendar', check: (c) => c.perfectHabitWeek },
  { id: 'backlog-5', title: 'Разбор инвентаря', description: 'Закрыть 5 задач из инвентаря', icon: 'chest', check: (c) => c.closedFromBacklog >= 5 },
  { id: 'backlog-empty', title: 'Пустые карманы', description: 'Опустошить инвентарь', icon: 'bag', check: (c) => c.backlogEverUsed && c.backlogCount === 0 },
  { id: 'early-bird', title: 'Ранняя пташка', description: 'Закрыть задачу до 8:00', icon: 'sun', check: (c) => c.earlyBird },
  { id: 'perfect-day', title: 'Идеальный день', description: 'Выполнить все задачи дня (от 3)', icon: 'gem', check: (c) => c.perfectDays >= 1 },
  { id: 'level-5', title: 'Опытный', description: 'Достичь 5 уровня', icon: 'potion', check: (c) => c.level >= 5 },
  { id: 'level-10', title: 'Мастер', description: 'Достичь 10 уровня', icon: 'heart', check: (c) => c.level >= 10 },
];

export function newlyUnlocked(ctx: AchievementContext, unlocked: ReadonlySet<string>): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !unlocked.has(a.id) && a.check(ctx));
}
