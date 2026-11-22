/* Готовые программы для новичка: на них ссылаются знакомство с приложением и пустой экран «Программа». */
import type { ProgramItem } from './types';

const reps = (exerciseId: string, n: string): ProgramItem => ({ exerciseId, sets: 3, reps: n });
const hold = (exerciseId: string, sec: number): ProgramItem => ({ exerciseId, sets: 3, durationSec: sec });

/** Программы на всё тело, три раза в неделю (пн, ср, пт). Упражнения — из встроенного справочника. */
export const STARTER_PROGRAMS: { key: string; label: string; hint: string; name: string; items: ProgramItem[] }[] = [
  {
    key: 'gym',
    label: 'В зале: всё тело для новичка',
    hint: 'присед с гантелью, жим в тренажёре, тяга блока, жим гантелей сидя, планка',
    name: 'Всё тело (зал)',
    items: [reps('goblet-squat', '10–12'), reps('machine-chest-press', '10–12'), reps('lat-pulldown', '10–12'), reps('dumbbell-shoulder-press', '10–12'), hold('plank', 30)],
  },
  {
    key: 'home',
    label: 'Дома без железа',
    hint: 'отжимания, стульчик у стены, скручивания, планка',
    name: 'Всё тело (дома)',
    items: [reps('push-ups', '8–12'), hold('wall-sit', 30), reps('crunches', '15'), hold('plank', 30)],
  },
];
