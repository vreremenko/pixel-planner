import type { SyncMeta } from '../../../core/domain/types';
import type { CustomExercise, Program } from '../domain/types';
import { exerciseRepo, programRepo } from '../data/repo';

export async function saveProgram(p: Omit<Program, keyof SyncMeta | 'order'> & Partial<Program>): Promise<void> {
  const order = p.order ?? (await programRepo.all()).reduce((m, x) => Math.max(m, x.order), 0) + 1;
  await programRepo.save({ ...p, order });
}

export const deleteProgram = (id: string) => programRepo.remove(id);

/** Сдвинуть день программы вверх/вниз. */
export async function moveProgram(id: string, dir: -1 | 1): Promise<void> {
  const list = await programRepo.all();
  const i = list.findIndex((p) => p.id === id);
  const j = i + dir;
  const a = list[i];
  const b = list[j];
  if (!a || !b) return;
  await programRepo.save({ ...a, order: b.order });
  await programRepo.save({ ...b, order: a.order });
}

export const saveExercise = (x: Omit<CustomExercise, keyof SyncMeta> & Partial<SyncMeta>) => exerciseRepo.save(x);
export const deleteExercise = (id: string) => exerciseRepo.remove(id);
