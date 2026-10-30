/* Группы мышц: id, название и буква в пиксельном рисунке атлета (MuscleMap). */
export const MUSCLES = {
  chest: { label: 'Грудные', letter: 'C' },
  frontDelts: { label: 'Передние дельты', letter: 'A' },
  sideDelts: { label: 'Средние дельты', letter: 'M' },
  rearDelts: { label: 'Задние дельты', letter: 'R' },
  biceps: { label: 'Бицепс', letter: 'B' },
  triceps: { label: 'Трицепс', letter: 'T' },
  forearms: { label: 'Предплечья', letter: 'F' },
  abs: { label: 'Пресс', letter: 'K' },
  obliques: { label: 'Косые мышцы живота', letter: 'O' },
  lats: { label: 'Широчайшие', letter: 'L' },
  traps: { label: 'Трапеции', letter: 'Q' },
  lowerBack: { label: 'Поясница', letter: 'W' },
  glutes: { label: 'Ягодицы', letter: 'G' },
  quads: { label: 'Квадрицепс', letter: 'U' },
  hamstrings: { label: 'Бицепс бедра', letter: 'N' },
  calves: { label: 'Икры', letter: 'V' },
} as const;

export type MuscleId = keyof typeof MUSCLES;
export const MUSCLE_IDS = Object.keys(MUSCLES) as MuscleId[];
