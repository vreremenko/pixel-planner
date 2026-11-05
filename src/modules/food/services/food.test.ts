import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../core/data/db';
import { entryRepo, itemRepo } from '../data/repo';
import { addEntry, copyMeal, removeEntry, setGrams } from './entries';
import { saveFood } from './foods';
import { parseOff } from './off';

const food = { id: 'cat:Творог 5%', name: 'Творог 5%', kcal: 121, protein: 17, fat: 5, carbs: 2 };
const D = '2026-11-04';

describe('дневник питания', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('запись хранит снимок: правка своего продукта не меняет прошлые дни', async () => {
    const mine = await saveFood({ kind: 'product', name: 'Каша', kcal: 100, protein: 3, fat: 1, carbs: 20 });
    await addEntry(D, 'breakfast', mine, 200);
    await saveFood({ ...mine, kcal: 500 });
    expect((await entryRepo.byDate(D))[0]).toMatchObject({ kcal: 100, grams: 200, foodId: mine.id });
  });

  it('граммовка правится, удалённая запись пропадает', async () => {
    await addEntry(D, 'lunch', food, 100);
    const [e] = await entryRepo.byDate(D);
    await setGrams(e!, 150);
    expect((await entryRepo.byDate(D))[0]?.grams).toBe(150);
    await removeEntry(e!.id);
    expect(await entryRepo.byDate(D)).toHaveLength(0);
  });

  it('продукт из Open Food Facts сохраняется в свои один раз, справочник — нет', async () => {
    const off = { ...food, id: 'off:123', brand: 'Простоквашино' };
    await addEntry(D, 'lunch', off, 100);
    await addEntry(D, 'dinner', off, 100);
    await addEntry(D, 'dinner', food, 100);
    expect((await itemRepo.all()).map((x) => x.id)).toEqual(['off:123']);
  });

  it('повтор приёма пищи создаёт новые записи на другой день', async () => {
    await addEntry('2026-11-03', 'breakfast', food, 180);
    await copyMeal(await entryRepo.byDate('2026-11-03'), D);
    const copied = await entryRepo.byDate(D);
    expect(copied).toHaveLength(1);
    expect(copied[0]).toMatchObject({ meal: 'breakfast', grams: 180, date: D });
    expect(await entryRepo.byDate('2026-11-03')).toHaveLength(1);
  });
});

describe('Open Food Facts', () => {
  const n = { 'energy-kcal_100g': 117, proteins_100g: 15, fat_100g: 5, carbohydrates_100g: 3 };
  it('разбирает продукт и первую марку', () => {
    expect(parseOff({ code: '46', product_name: ' Творог 5% ', brands: 'Простоквашино, Danone', nutriments: n })).toEqual({ id: 'off:46', name: 'Творог 5%', brand: 'Простоквашино', kcal: 117, protein: 15, fat: 5, carbs: 3 });
  });
  it('марки приходят и списком', () => {
    expect(parseOff({ code: '46', product_name: 'Кефир', brands: ['Простоквашино'], nutriments: n })?.brand).toBe('Простоквашино');
  });
  it('килоджоули переводит, неполный продукт отбрасывает', () => {
    expect(parseOff({ code: '1', product_name: 'X', nutriments: { 'energy-kj_100g': 418.4, proteins_100g: 1, fat_100g: 1, carbohydrates_100g: 1 } })?.kcal).toBe(100);
    expect(parseOff({ code: '1', product_name: 'X', nutriments: { energy_100g: 418.4, proteins_100g: 1, fat_100g: 1, carbohydrates_100g: 1 } })?.kcal).toBe(100);
    expect(parseOff({ code: '1', product_name: 'X', nutriments: { proteins_100g: 1 } })).toBeNull();
    expect(parseOff({ code: '1', nutriments: n })).toBeNull();
  });
});
