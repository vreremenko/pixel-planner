import { describe, expect, it } from 'vitest';
import { buildStats, dayOf, haikuRubOf, neuronsOf } from './admin.ts';
import type { AdminUserRow } from './types.ts';

const NOW = Date.UTC(2026, 10, 22, 12);
const DAY = 86_400_000;
const user = (id: string, email: string): AdminUserRow => ({ id, email, emailVerified: true, telegram: false, createdAt: NOW - 40 * DAY, lastSeen: NOW, sessions: 1, pushDevices: 0, appVersion: null });
const use = (day: string, userId: string, tokensIn: number, phrases = 1) => ({ day, userId, phrases, calls: 2, tokensIn, tokensOut: 10, voice: 0 });

describe('админка: нейросеть', () => {
  it('суммирует токены за сегодня, неделю и месяц и раскладывает по людям', () => {
    const stats = buildStats({
      now: NOW,
      admins: [],
      users: [user('a', 'a@b.ru'), user('b', 'b@b.ru')],
      activity: [],
      records: [],
      ai: [use(dayOf(NOW), 'a', 1000), use(dayOf(NOW), 'b', 500), use(dayOf(NOW - 3 * DAY), 'a', 2000), use(dayOf(NOW - 20 * DAY), 'b', 9000), use(dayOf(NOW - 60 * DAY), 'a', 1)],
      aiPerDay: 60,
    });
    expect(stats.ai.today).toMatchObject({ phrases: 2, tokensIn: 1500, tokensOut: 20 });
    expect(stats.ai.week.tokensIn).toBe(3500);
    expect(stats.ai.month.tokensIn).toBe(12_500);
    expect(stats.ai.days.at(-1)?.tokens).toBe(1520);
    expect(stats.ai.perUserDay).toBe(60);
    const a = stats.list.find((u) => u.email === 'a@b.ru');
    expect(a?.ai.today.tokensIn).toBe(1000);
    expect(a?.ai.week.tokensIn).toBe(3000);
    expect(stats.list.find((u) => u.email === 'b@b.ru')?.ai.week.tokensIn).toBe(500);
  });

  it('оценивает нейроны, долю бесплатного дня и цену на Haiku', () => {
    // Фраза со скриншота: 8 398 токенов на входе, 215 на выходе, одно голосовое ≈ 46 + 8 + 12 нейронов
    expect(neuronsOf({ tokensIn: 8398, tokensOut: 215, voice: 1 })).toBe(66);
    // На Haiku: (8398 × 0,10 + 215 × 0,50) / 1e6 $ × 80 ≈ 7,6 копейки
    expect(haikuRubOf({ tokensIn: 8398, tokensOut: 215 })).toBeCloseTo(0.0758, 3);
    const stats = buildStats({ now: NOW, admins: [], users: [], activity: [], records: [], ai: [{ day: dayOf(NOW), userId: 'a', phrases: 1, calls: 2, tokensIn: 8398, tokensOut: 215, voice: 1 }] });
    expect(stats.ai.freeUsedPct).toBeCloseTo(0.66, 2);
    expect(stats.ai.perPhrase?.haikuRub).toBeCloseTo(0.0758, 3);
  });
});
