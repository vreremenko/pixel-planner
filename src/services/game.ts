import { ACHIEVEMENTS, newlyUnlocked, type AchievementContext } from '../domain/achievements';
import { addDays, dateOf, rangeDates, startOfWeek, today } from '../domain/dates';
import { habitStreak, isScheduled } from '../domain/streaks';
import type { LocalDate, XpSource } from '../domain/types';
import { levelFromXp, XP_ACHIEVEMENT, xpEventId } from '../domain/xp';
import {
  achievementRepo,
  habitLogRepo,
  habitRepo,
  metaRepo,
  taskRepo,
  xpRepo,
} from '../data/repo';
import { useGame } from '../stores/game';
import { play } from './sfx';

/** Начислить XP за выполнение (идемпотентно), проверить уровень и достижения. */
export async function awardXp(source: XpSource, refKey: string, amount: number, date: LocalDate) {
  const before = levelFromXp(await xpRepo.total()).level;
  const ok = await xpRepo.award({ id: xpEventId(source, refKey), source, refKey, amount, date });
  if (!ok) return;
  useGame.getState().emit({ type: 'xp', amount });
  play('complete');
  await checkAchievements();
  const after = levelFromXp(await xpRepo.total()).level;
  if (after > before) {
    useGame.getState().emit({ type: 'levelup', level: after });
    play('levelup');
  }
}

/** Отменить начисление при снятии отметки. */
export async function revokeXp(source: XpSource, refKey: string) {
  await xpRepo.revoke(xpEventId(source, refKey));
}

async function buildAchievementContext(): Promise<AchievementContext> {
  const [tasks, habits, logs, total] = await Promise.all([
    taskRepo.all(),
    habitRepo.all(),
    habitLogRepo.all(),
    xpRepo.total(),
  ]);
  const t = today();
  const closed = tasks.filter((x) => x.done);
  const backlog = tasks.filter((x) => x.date === null);

  const byDay = new Map<LocalDate, { all: number; done: number }>();
  for (const x of tasks) {
    if (!x.date) continue;
    const e = byDay.get(x.date) ?? { all: 0, done: 0 };
    e.all++;
    if (x.done) e.done++;
    byDay.set(x.date, e);
  }
  const perfectDays = [...byDay.values()].filter((e) => e.all >= 3 && e.done === e.all).length;

  const logsByHabit = new Map<string, Set<LocalDate>>();
  for (const l of logs) {
    let s = logsByHabit.get(l.habitId);
    if (!s) logsByHabit.set(l.habitId, (s = new Set()));
    s.add(l.date);
  }
  let best = 0;
  for (const h of habits) {
    best = Math.max(best, habitStreak(h, logsByHabit.get(h.id) ?? new Set(), t).best);
  }

  // Неделя без пропусков: прошедшая полная неделя, где все запланированные привычки выполнены.
  let perfectHabitWeek = false;
  const active = habits.filter((h) => !h.archived);
  if (active.length > 0) {
    const earliest = Math.min(...active.map((h) => h.createdAt));
    for (let w = startOfWeek(addDays(t, -7)); w >= startOfWeek(dateOf(new Date(earliest))); w = addDays(w, -7)) {
      let scheduled = 0;
      let ok = true;
      for (const d of rangeDates(w, addDays(w, 6))) {
        for (const h of active) {
          if (dateOf(new Date(h.createdAt)) > d || !isScheduled(h.schedule, d)) continue;
          scheduled++;
          if (!logsByHabit.get(h.id)?.has(d)) ok = false;
        }
      }
      if (ok && scheduled > 0) {
        perfectHabitWeek = true;
        break;
      }
    }
  }

  return {
    tasksClosed: closed.length,
    closedFromBacklog: closed.filter((x) => x.wasInBacklog).length,
    backlogCount: backlog.filter((x) => !x.done).length,
    backlogEverUsed: (await metaRepo.get<boolean>('backlogUsed')) ?? false,
    bestHabitStreak: best,
    level: levelFromXp(total).level,
    perfectDays,
    earlyBird: closed.some((x) => x.doneAt !== undefined && new Date(x.doneAt).getHours() < 8),
    perfectHabitWeek,
    habitsCreated: habits.length,
  };
}

export async function checkAchievements() {
  const unlocked = new Set((await achievementRepo.all()).map((a) => a.achievementId));
  const fresh = newlyUnlocked(await buildAchievementContext(), unlocked);
  for (const a of fresh) {
    await achievementRepo.unlock(a.id);
    await xpRepo.award({ id: xpEventId('achievement', a.id), source: 'achievement', refKey: a.id, amount: XP_ACHIEVEMENT, date: today() });
    useGame.getState().emit({ type: 'achievement', achievementId: a.id });
    play('achievement');
  }
}

export const achievementById = (id: string) => ACHIEVEMENTS.find((a) => a.id === id);
