/* Анимации упражнений: id упражнения → загрузка кадров (свой кусок бандла, грузится при открытии карточки). */
export interface Anim {
  W: number;
  H: number;
  PALETTE: readonly string[];
  FRAMES: readonly (readonly string[])[];
}

export const ANIMS: Readonly<Record<string, () => Promise<Anim>>> = {
  squat: () => import('./squat'),
};
