import type { LocalDate, SyncMeta, Weekday } from '../../../core/domain/types';

/** Все суммы — целые копейки: так сложение не копит ошибки округления. */
export type Kopecks = number;

export interface Account extends SyncMeta {
  name: string;
  /** Остаток на момент создания счёта; текущий баланс считается из операций. */
  start: Kopecks;
  /** Считать ли деньги счёта в плане: копилку можно исключить. */
  inPlan: boolean;
  archived?: boolean;
}

export type CategoryKind = 'income' | 'expense';

export interface Category extends SyncMeta {
  name: string;
  kind: CategoryKind;
  archived?: boolean;
}

export type TxKind = CategoryKind | 'transfer';

export interface Tx extends SyncMeta {
  date: LocalDate;
  kind: TxKind;
  amount: Kopecks;
  accountId: string;
  /** Только у перевода. */
  toAccountId?: string;
  categoryId?: string;
  note?: string;
  /** Операция закрывает срок обязательного платежа. */
  paymentId?: string;
  dueDate?: LocalDate;
}

export type Repeat = 'once' | 'week' | 'month' | 'year';

export const REPEATS: readonly { value: Repeat; label: string }[] = [
  { value: 'once', label: 'Разово' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
  { value: 'year', label: 'Год' },
];

export interface Payment extends SyncMeta {
  name: string;
  amount: Kopecks;
  categoryId: string;
  repeat: Repeat;
  /** Первый срок; от него считаются повторы. */
  date: LocalDate;
  skipped: LocalDate[];
}

export interface FinPrefs extends SyncMeta {
  workDays?: Weekday[];
  /** Сумма на жизнь в день, заданная вручную; без неё берётся среднее. */
  livingManual?: Kopecks;
}

export const ALL_DAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];

/** Стартовые категории: в базу не пишутся, пока их не поправят, поэтому два устройства не создадут дублей. */
export const DEFAULT_CATEGORIES: readonly Pick<Category, 'id' | 'name' | 'kind'>[] = [
  { id: 'def:work', name: 'Работа', kind: 'income' },
  { id: 'def:side', name: 'Подработка', kind: 'income' },
  { id: 'def:gift', name: 'Подарки', kind: 'income' },
  { id: 'def:other-in', name: 'Другое', kind: 'income' },
  { id: 'def:food', name: 'Продукты', kind: 'expense' },
  { id: 'def:cafe', name: 'Кафе', kind: 'expense' },
  { id: 'def:transport', name: 'Транспорт', kind: 'expense' },
  { id: 'def:home', name: 'Жильё', kind: 'expense' },
  { id: 'def:subs', name: 'Подписки', kind: 'expense' },
  { id: 'def:health', name: 'Здоровье', kind: 'expense' },
  { id: 'def:clothes', name: 'Одежда', kind: 'expense' },
  { id: 'def:fun', name: 'Развлечения', kind: 'expense' },
  { id: 'def:other-out', name: 'Другое', kind: 'expense' },
];
