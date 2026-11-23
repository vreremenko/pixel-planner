/* Доходы по датам: режим, расписание выплат, «Пришла» и пропуск. */
import type { LocalDate } from '../../../core/domain/types';
import { prefsRepo, txRepo } from '../data/repo';
import type { Expected } from '../domain/income';
import type { IncomeMode, Kopecks, Payday } from '../domain/types';

export const setIncomeMode = (incomeMode: IncomeMode) => prefsRepo.patch({ incomeMode });

/** Сохранить выплату целиком: новую добавляет, существующую заменяет. */
export async function savePayday(p: Payday): Promise<void> {
  const list = (await prefsRepo.get()).paydays ?? [];
  await prefsRepo.patch({ paydays: list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p] });
}

export async function removePayday(id: string): Promise<void> {
  const list = (await prefsRepo.get()).paydays ?? [];
  await prefsRepo.patch({ paydays: list.filter((x) => x.id !== id) });
}

/** В этот раз денег не будет: дата выплаты пропускается, расчёт идёт к следующей. */
export async function skipPayday(e: Expected): Promise<void> {
  const list = (await prefsRepo.get()).paydays ?? [];
  await prefsRepo.patch({ paydays: list.map((x) => (x.id === e.paydayId ? { ...x, skipped: [...x.skipped, e.date] } : x)) });
}

/** Деньги пришли: доход закрывает ожидаемую выплату, а удаление дохода снова её откроет. */
export async function receivePayday(e: Pick<Expected, 'paydayId' | 'name' | 'date'>, amount: Kopecks, accountId: string, date: LocalDate) {
  return txRepo.save({ date, kind: 'income', amount, accountId, categoryId: 'def:work', note: e.name, paydayId: e.paydayId, dueDate: e.date });
}
