/*
 * Поиск магазинных продуктов в Open Food Facts (база под лицензией ODbL, нужна подпись источника).
 * Сервис разрешает запросы из браузера, поэтому наш сервер не участвует. Лимит — 10 поисков в минуту;
 * если поиск недоступен, вызывающий показывает сбой и остаётся со справочником.
 */
import type { FoodRef } from '../domain/types';

export const OFF_ORIGIN = 'https://ru.openfoodfacts.org';

interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string;
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
  const kj = num(n.energy_100g);
  const kcal = energy ?? (kj === null ? null : kj / 4.184);
  const protein = num(n.proteins_100g);
  const fat = num(n.fat_100g);
  const carbs = num(n.carbohydrates_100g);
  if (!name || !p.code || kcal === null || kcal > 950 || protein === null || fat === null || carbs === null) return null;
  const brand = p.brands?.split(',')[0]?.trim();
  return { id: `off:${p.code}`, name, kcal: Math.round(kcal), protein, fat, carbs, ...(brand ? { brand } : {}) };
}

const ATTEMPTS = 3;
const RETRY_MS = 1500;

const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('aborted', 'AbortError'));
    });
  });

/**
 * Сервис часто отвечает 503, причём без заголовка CORS, поэтому браузер видит просто сетевую ошибку.
 * Со второй-третьей попытки обычно проходит.
 */
export async function searchOff(query: string, signal: AbortSignal): Promise<FoodRef[]> {
  const params = new URLSearchParams({ search_terms: query, search_simple: '1', action: 'process', json: '1', page_size: '20', fields: 'code,product_name,brands,nutriments' });
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${OFF_ORIGIN}/cgi/search.pl?${params.toString()}`, { signal });
      if (!res.ok) throw new Error(`off ${String(res.status)}`);
      const data = (await res.json()) as { products?: OffProduct[] };
      return (data.products ?? []).map(parseOff).filter((x): x is FoodRef => x !== null);
    } catch (e) {
      if (signal.aborted || attempt === ATTEMPTS) throw e;
      await pause(RETRY_MS, signal);
    }
  }
}
