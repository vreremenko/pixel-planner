import type { Task } from './types';

/** Порядок списка задач: как расставил пользователь (order), при равенстве — новые выше. */
export const byListOrder = (a: Task, b: Task): number => a.order - b.order || b.createdAt - a.createdAt;
