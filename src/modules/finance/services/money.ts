/* Действия с деньгами: операции, оплата и пропуск сроков. */
import type { LocalDate } from '../../../core/domain/types';
import { paymentRepo, txRepo } from '../data/repo';
import type { Due } from '../domain/plan';
import type { Kopecks, Payment } from '../domain/types';

/** Оплата закрывает срок: расход связан с платежом, и удаление расхода снова открывает срок. */
export async function payDue(due: Due, amount: Kopecks, accountId: string, date: LocalDate): Promise<void> {
  await txRepo.save({ date, kind: 'expense', amount, accountId, categoryId: due.categoryId, note: due.name, paymentId: due.paymentId, dueDate: due.date });
}

export async function skipDue(payment: Payment, date: LocalDate): Promise<void> {
  await paymentRepo.save({ ...payment, skipped: [...payment.skipped, date] });
}
