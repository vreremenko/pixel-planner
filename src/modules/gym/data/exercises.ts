/* Все упражнения: справочник + свои. */
import { useLiveQuery } from 'dexie-react-hooks';
import { CATALOG } from '../domain/catalog';
import type { CustomExercise, ExerciseDef } from '../domain/types';
import { exerciseRepo } from './repo';

export const customToDef = (c: CustomExercise): ExerciseDef => ({ ...c, custom: true });

export function useExercises(): { list: ExerciseDef[]; byId: (id: string) => ExerciseDef | undefined } | undefined {
  const custom = useLiveQuery(() => exerciseRepo.all(), []);
  if (!custom) return undefined;
  const list = [...CATALOG, ...custom.map(customToDef)];
  const map = new Map(list.map((e) => [e.id, e]));
  return { list, byId: (id) => map.get(id) };
}
