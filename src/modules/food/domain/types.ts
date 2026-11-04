import type { LocalDate, SyncMeta } from '../../../core/domain/types';

/** Калории и БЖУ: на 100 г у продукта, в сумме — у порции и дня. */
export interface Macros {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

export const MEALS = [
  { id: 'breakfast', label: 'Завтрак' },
  { id: 'lunch', label: 'Обед' },
  { id: 'dinner', label: 'Ужин' },
  { id: 'snack', label: 'Перекус' },
] as const;
export type Meal = (typeof MEALS)[number]['id'];

/** Что можно съесть: из справочника, из Open Food Facts или своё. Значения — на 100 г. */
export interface FoodRef extends Macros {
  /** cat:… — справочник, off:… — Open Food Facts, иначе id своей записи. */
  id: string;
  name: string;
  brand?: string;
  /** Обычная порция, г (штука, тарелка, пачка). */
  portion?: number;
}

export interface Ingredient extends Macros {
  name: string;
  grams: number;
}

/** Свой продукт, блюдо или сохранённый продукт из Open Food Facts. */
export interface FoodItem extends SyncMeta, Macros {
  name: string;
  kind: 'product' | 'dish';
  brand?: string;
  portion?: number;
  ingredients?: Ingredient[];
  /** Вес готового блюда, г: вода уваривается, и на 100 г выходит больше, чем по сумме ингредиентов. */
  cookedWeight?: number;
}

/** Запись дневника. Название и КБЖУ на 100 г — снимок: правка продукта не меняет прошлые дни. */
export interface FoodEntry extends SyncMeta, Macros {
  date: LocalDate;
  meal: Meal;
  grams: number;
  name: string;
  brand?: string;
  foodId: string;
  portion?: number;
}

export type Sex = 'male' | 'female';
export type GoalKind = 'lose' | 'keep' | 'gain';

export const ACTIVITY = [
  { value: '1.2', label: 'Почти без движения' },
  { value: '1.375', label: 'Лёгкая: 1–3 тренировки в неделю' },
  { value: '1.55', label: 'Средняя: 3–5 тренировок' },
  { value: '1.725', label: 'Высокая: 6–7 тренировок' },
  { value: '1.9', label: 'Очень высокая: тяжёлый труд и спорт' },
] as const;

export interface Profile {
  sex: Sex;
  age: number;
  height: number;
  weight: number;
  activity: number;
  goal: GoalKind;
}

/** Настройки раздела, одни на все устройства аккаунта (id = 'prefs'). */
export interface FoodPrefs extends SyncMeta {
  /** Норма на день; нет — цель ещё не задана. */
  goal?: Macros;
  profile?: Profile;
}
