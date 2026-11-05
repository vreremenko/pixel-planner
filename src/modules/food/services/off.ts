/*
 * Поиск магазинных продуктов в Open Food Facts (база под лицензией ODbL, нужна подпись источника).
 * Запрос идёт через наш сервер: из России сервис напрямую не открывается.
 * Если поиск недоступен, вызывающий показывает сбой и остаётся со справочником.
 */
import { apiUrl } from '../../../core/apiBase';
import type { FoodRef } from '../domain/types';

interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string | string[];
  nutriments?: Record<string, number | string | undefined>;
}

const num = (v: number | string | undefined): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return n !== undefined && Number.isFinite(n) && n >= 0 ? n : null;
};

/** Продукт без названия или без полных значений на 100 г в дневнике бесполезен. */
export function parseOff(p: OffProduct): FoodRef | null {
  const n = p.nutriments ?? {};
  const name = p.product_name?.trim();
  const energy = num(n['energy-kcal_100g']);
  const kj = num(n['energy-kj_100g'] ?? n.energy_100g);
  const kcal = energy ?? (kj === null ? null : kj / 4.184);
  const protein = num(n.proteins_100g);
  const fat = num(n.fat_100g);
  const carbs = num(n.carbohydrates_100g);
  if (!name || !p.code || kcal === null || kcal > 950 || protein === null || fat === null || carbs === null) return null;
  const brand = (Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(',')[0])?.trim();
  return { id: `off:${p.code}`, name, kcal: Math.round(kcal), protein, fat, carbs, ...(brand ? { brand } : {}) };
}

const ATTEMPTS = 2;
const RETRY_MS = 1500;

const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('aborted', 'AbortError'));
    });
  });

/** Сервис временами отвечает ошибкой, со второй попытки обычно проходит. */
export async function searchOff(query: string, signal: AbortSignal): Promise<FoodRef[]> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(apiUrl(`food/search?q=${encodeURIComponent(query)}`), { signal });
      if (!res.ok) throw new Error(`off ${String(res.status)}`);
      const data = (await res.json()) as { products?: OffProduct[] };
      return (data.products ?? []).map(parseOff).filter((x): x is FoodRef => x !== null);
    } catch (e) {
      if (signal.aborted || attempt === ATTEMPTS) throw e;
      await pause(RETRY_MS, signal);
    }
  }
}
