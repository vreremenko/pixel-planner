/*
 * Сводка для админки. Только количества: содержимое записей сюда не попадает.
 * Активность считается по дням (UTC): день пользователя отмечается при любом запросе с его сессией.
 */
import type { ActivityRow, AdminRecordRow, AdminUserRow, AiUsage, AiUsageRow } from './types.ts';

const DAY = 86_400_000;
/** Столбцов на графике: при большем числе подписи на телефоне не читаются. */
const CHART_DAYS = 7;

export const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Раздел таблицы синхронизации; настройки разделов не считаем: это не работа с приложением. */
function moduleOf(table: string): string | null {
  if (table.endsWith('_prefs')) return null;
  if (table.startsWith('food_')) return 'Питание';
  if (table.startsWith('fin_')) return 'Финансы';
  if (table.startsWith('gym_')) return 'Тренировки';
  if (table.startsWith('habit')) return 'Привычки';
  return 'Задачи';
}

export interface StatsInput {
  now: number;
  admins: readonly string[];
  users: readonly AdminUserRow[];
  activity: readonly ActivityRow[];
  records: readonly AdminRecordRow[];
  /** Расход нейросети по дням за последние недели (может быть пустым). */
  ai?: readonly AiUsageRow[];
  /** Сколько фраз в сутки можно одному пользователю. */
  aiPerDay?: number;
}

/**
 * Бесплатный лимит Workers AI — 10 000 «нейронов» в сутки (UTC) на аккаунт Cloudflare. Сколько нейронов
 * уходит на токен, зависит от модели, поэтому точный остаток виден только в панели Cloudflare;
 * здесь — наш собственный учёт токенов и фраз.
 */
export const AI_FREE_NEURONS = 10_000;

/**
 * Прикидка, а не бухгалтерия. Цены на ноябрь 2026, проверять перед решениями:
 * - Workers AI, glm-4.7-flash: 5 500 нейронов за миллион входных токенов, 36 400 — за миллион выходных;
 *   запасная модель (gpt-oss-20b) считается по тем же цифрам.
 * - Whisper: ~46 нейронов за минуту звука; длину голосовых не храним, берём ~15 секунд на сообщение.
 * - Сверх бесплатного Cloudflare берёт $0,011 за 1 000 нейронов.
 * - Claude Haiku 5.5: $0,10 за миллион входных, $0,50 за миллион выходных токенов (запросы до 100K токенов).
 * - Курс — примерный, рублей за доллар.
 */
export const AI_PRICES = {
  neuronsPerMIn: 5_500,
  neuronsPerMOut: 36_400,
  neuronsPerVoice: 12,
  usdPerNeuron: 0.011 / 1000,
  haikuUsdPerMIn: 0.1,
  haikuUsdPerMOut: 0.5,
  rubPerUsd: 80,
} as const;

/** Нейроны Workers AI на этот расход (округлено). */
export function neuronsOf(u: Pick<AiUsage, 'tokensIn' | 'tokensOut' | 'voice'>): number {
  const p = AI_PRICES;
  return Math.round((u.tokensIn * p.neuronsPerMIn + u.tokensOut * p.neuronsPerMOut) / 1e6 + u.voice * p.neuronsPerVoice);
}

/** Сколько стоили бы те же токены на Claude Haiku 5.5, в рублях (голос не считаем: его распознаёт отдельная модель). */
export function haikuRubOf(u: Pick<AiUsage, 'tokensIn' | 'tokensOut'>): number {
  const p = AI_PRICES;
  return ((u.tokensIn * p.haikuUsdPerMIn + u.tokensOut * p.haikuUsdPerMOut) / 1e6) * p.rubPerUsd;
}

/** Оценки к расходу: нейроны, доля бесплатного дня, рубли на Workers AI сверх бесплатного и на Haiku. */
function priced(u: AiUsage) {
  const neurons = neuronsOf(u);
  return { ...u, neurons, haikuRub: haikuRubOf(u), workersRub: neurons * AI_PRICES.usdPerNeuron * AI_PRICES.rubPerUsd };
}

const zero = (): AiUsage => ({ phrases: 0, calls: 0, tokensIn: 0, tokensOut: 0, voice: 0 });
function addUsage(to: AiUsage, x: AiUsage): AiUsage {
  to.phrases += x.phrases;
  to.calls += x.calls;
  to.tokensIn += x.tokensIn;
  to.tokensOut += x.tokensOut;
  to.voice += x.voice;
  return to;
}

export function buildStats({ now, admins, users, activity, records, ai = [], aiPerDay = 0 }: StatsInput) {
  const days = Array.from({ length: CHART_DAYS }, (_, i) => dayOf(now - (CHART_DAYS - 1 - i) * DAY));
  const within = (from: number, to: number) => {
    const first = dayOf(now - from * DAY);
    const last = dayOf(now - to * DAY);
    return new Set(activity.filter((a) => a.day >= first && a.day <= last).map((a) => a.userId));
  };
  const monthStart = dayOf(now - 29 * DAY);
  const week = within(6, 0);
  const previous = within(13, 7);

  const modules = new Map<string, { name: string; records: number; users: Set<string>; active: Set<string> }>();
  const perUser = new Map<string, Map<string, number>>();
  for (const r of records) {
    const name = moduleOf(r.table);
    if (name === null || r.records === 0) continue;
    const m = modules.get(name) ?? { name, records: 0, users: new Set(), active: new Set() };
    m.records += r.records;
    m.users.add(r.userId);
    if (r.recent > 0) m.active.add(r.userId);
    modules.set(name, m);
    const mine = perUser.get(r.userId) ?? new Map<string, number>();
    mine.set(name, (mine.get(name) ?? 0) + r.records);
    perUser.set(r.userId, mine);
  }

  const today = dayOf(now);
  const weekStart = dayOf(now - 6 * DAY);
  const aiToday = zero();
  const aiWeek = zero();
  const aiMonth = zero();
  const aiUserToday = new Map<string, AiUsage>();
  const aiUserWeek = new Map<string, AiUsage>();
  for (const r of ai) {
    if (r.day < monthStart) continue;
    addUsage(aiMonth, r);
    if (r.day >= weekStart) {
      addUsage(aiWeek, r);
      aiUserWeek.set(r.userId, addUsage(aiUserWeek.get(r.userId) ?? zero(), r));
    }
    if (r.day === today) {
      addUsage(aiToday, r);
      aiUserToday.set(r.userId, addUsage(aiUserToday.get(r.userId) ?? zero(), r));
    }
  }

  return {
    ai: {
      today: priced(aiToday),
      week: priced(aiWeek),
      month: priced(aiMonth),
      /** Доля бесплатного дневного лимита Workers AI, потраченная сегодня, в процентах (оценка). */
      freeUsedPct: (neuronsOf(aiToday) / AI_FREE_NEURONS) * 100,
      /** На сколько фраз в среднем уходят эти токены — для прикидки «сколько стоит фраза». */
      perPhrase: aiMonth.phrases > 0 ? priced({ ...aiMonth, tokensIn: aiMonth.tokensIn / aiMonth.phrases, tokensOut: aiMonth.tokensOut / aiMonth.phrases, voice: aiMonth.voice / aiMonth.phrases, phrases: 1, calls: aiMonth.calls / aiMonth.phrases }) : null,
      rubPerUsd: AI_PRICES.rubPerUsd,
      days: days.map((date) => ({
        date,
        tokens: ai.filter((r) => r.day === date).reduce((s, r) => s + r.tokensIn + r.tokensOut, 0),
      })),
      freeNeurons: AI_FREE_NEURONS,
      perUserDay: aiPerDay,
    },
    since: activity.reduce<string | null>((a, x) => (a === null || x.day < a ? x.day : a), null),
    users: {
      total: users.length,
      new7: users.filter((u) => now - u.createdAt < 7 * DAY).length,
      new30: users.filter((u) => now - u.createdAt < 30 * DAY).length,
      withPush: users.filter((u) => u.pushDevices > 0).length,
    },
    active: { day: within(0, 0).size, week: week.size, month: within(29, 0).size },
    /** Кто был на прошлой неделе и вернулся на этой. */
    returned: { previous: previous.size, back: [...previous].filter((id) => week.has(id)).length },
    days: days.map((date) => ({ date, users: activity.filter((a) => a.day === date).length })),
    modules: [...modules.values()]
      .map((m) => ({ name: m.name, records: m.records, users: m.users.size, active: m.active.size }))
      .sort((a, b) => b.active - a.active || b.records - a.records),
    list: [...users]
      .sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0))
      .map((u) => ({
        email: u.email,
        admin: admins.includes(u.email),
        sanctions: u.sanctions,
        verified: u.emailVerified,
        telegram: u.telegram,
        createdAt: u.createdAt,
        lastSeen: u.lastSeen,
        sessions: u.sessions,
        pushDevices: u.pushDevices,
        version: u.appVersion,
        activeDays: activity.filter((a) => a.userId === u.id && a.day >= monthStart).length,
        records: Object.fromEntries(perUser.get(u.id) ?? []),
        ai: { today: priced(aiUserToday.get(u.id) ?? zero()), week: priced(aiUserWeek.get(u.id) ?? zero()) },
      })),
  };
}
