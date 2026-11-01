/* Анимации упражнений: id упражнения → загрузка кадров (свой кусок бандла, грузится при открытии карточки). */
export interface Anim {
  W: number;
  H: number;
  PALETTE: readonly string[];
  FRAMES: readonly (readonly string[])[];
}

export const ANIMS: Readonly<Record<string, () => Promise<Anim>>> = {
  'bench-press': () => import('./bench-press'),
  'dumbbell-press': () => import('./dumbbell-press'),
  'incline-dumbbell-press': () => import('./incline-dumbbell-press'),
  'dumbbell-fly': () => import('./dumbbell-fly'),
  'barbell-row': () => import('./barbell-row'),
  'overhead-press': () => import('./overhead-press'),
  'dumbbell-shoulder-press': () => import('./dumbbell-shoulder-press'),
  'dumbbell-curl': () => import('./dumbbell-curl'),
  squat: () => import('./squat'),
};
