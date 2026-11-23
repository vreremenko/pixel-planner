/* Финансы в «Сегодня»: платежи, которым пора, ожидаемые выплаты и главное число режима дохода. */
import type { LocalDate } from '../../core/domain/types';
import type { TodayFeed, TodayItem } from '../../core/module';
import { accountRepo, paymentRepo, prefsRepo, txRepo } from './data/repo';
import { daysText, rub, rubUp } from './domain/money';
import { buildPlanView } from './domain/view';

export async function loadToday(today: LocalDate): Promise<TodayFeed> {
  const [accounts, txs, payments, prefs] = await Promise.all([accountRepo.all(), txRepo.all(), paymentRepo.all(), prefsRepo.get()]);
  if (accounts.every((a) => a.archived)) return { items: [] };
  const v = buildPlanView(today, accounts, txs, payments, prefs);
  const base = { icon: 'coin', accent: 'var(--c-fin)', to: '/finance', done: false } as const;
  const items: TodayItem[] = [
    // Срок наступил сегодня или уже прошёл — это «пора оплатить»
    ...v.dues.filter((d) => d.date <= today).map((d): TodayItem => ({ ...base, id: `pay:${d.paymentId}:${d.date}`, title: `Платёж: ${d.name}`, detail: `${rub(d.amount)}${d.date < today ? ', просрочен' : ''}` })),
    ...(v.mode === 'salary' ? v.expected.filter((e) => e.when <= today).map((e): TodayItem => ({ ...base, id: `pay-in:${e.paydayId}:${e.date}`, title: `Ждём «${e.name}»`, detail: rub(e.amount) })) : []),
  ];

  let stat: TodayFeed['stat'];
  const make = (label: string, value: string) => ({ id: 'fin', label, value, to: '/finance', accent: 'var(--c-fin)' });
  if (v.mode === 'salary' && v.salary.state === 'ok') stat = make(v.salary.left >= 0 ? 'Можно тратить' : 'Перерасход', rub(Math.floor(Math.abs(v.salary.left) / 100) * 100));
  else if (v.mode === 'daily' && v.dues.length > 0 && !v.plan.dayOff && v.plan.target > 0) stat = make('Заработать', rubUp(v.plan.left));
  else if (v.mode === 'irregular' && (v.living > 0 || v.dues.length > 0)) stat = make('Хватит на', v.irregular.runway === null ? '3+ мес.' : v.irregular.runway === 0 ? '< суток' : daysText(v.irregular.runway));
  return { items, ...(stat ? { stat } : {}) };
}
