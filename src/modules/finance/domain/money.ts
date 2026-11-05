import { parseValue } from '../../../core/domain/numbers';
import type { Kopecks } from './types';

/** Сумма из поля ввода; null — не число. */
export function toKopecks(text: string): Kopecks | null {
  const v = parseValue(text);
  return v === null ? null : Math.round(v * 100);
}

/** Для поля ввода: 1250.5 без пробелов и валюты. */
export const kopecksText = (k: Kopecks): string => String(k / 100);

/** 12 345 ₽ или 12 345,50 ₽. */
export function rub(k: Kopecks): string {
  const fraction = k % 100 === 0 ? 0 : 2;
  return `${(k / 100).toLocaleString('ru-RU', { minimumFractionDigits: fraction, maximumFractionDigits: fraction })}\u00a0₽`;
}

/** Дневная цель: копейки здесь только мешают, округляем вверх до рубля. */
export const rubUp = (k: Kopecks): string => rub(Math.ceil(k / 100) * 100);
