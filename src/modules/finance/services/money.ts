/* Действия с деньгами: операции, оплата и пропуск сроков. */
import type { LocalDate } from '../../../core/domain/types';
import { paymentRepo, txRepo } from '../data/repo';
import type { Due } from '../domain/plan';
import { linkedSaves } from '../domain/save';
import type { Kopecks, Payment, Tx } from '../domain/types';

/** Оплата закрывает срок: расход связан с платежом, и удаление расхода снова открывает срок. */
export async function payDue(due: Due, amount: Kopecks, accountId: string, date: LocalDate): Promise<void> {
  await txRepo.save({ date, kind: 'expense', amount, accountId, categoryId: due.categoryId, note: due.name, paymentId: due.paymentId, dueDate: due.date });
}

export async function skipDue(payment: Payment, date: LocalDate): Promise<void> {
  await paymentRepo.save({ ...payment, skipped: [...payment.skipped, date] });
}

/** Откладывание: перевод в копилку в день дохода, связанный с ним, чтобы удаление дохода предложило убрать и перевод. */
export async function saveFromIncome(income: Tx, amount: Kopecks, toAccountId: string): Promise<void> {
  await txRepo.save({ date: income.date, kind: 'transfer', amount, accountId: income.accountId, toAccountId, note: 'Отложено с дохода', fromTxId: income.id });
}

/** Удаляет операцию и переводы, отложенные с этого дохода. */
export async function removeTx(tx: Tx, txs: readonly Tx[]): Promise<void> {
  for (const t of linkedSaves(txs, tx.id)) await txRepo.remove(t.id);
  await txRepo.remove(tx.id);
}
