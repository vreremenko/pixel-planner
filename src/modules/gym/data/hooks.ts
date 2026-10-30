import { useLiveQuery } from 'dexie-react-hooks';
import { prefsRepo, programRepo, setRepo, workoutRepo } from './repo';

export const usePrograms = () => useLiveQuery(() => programRepo.all(), []);
export const useWorkouts = () => useLiveQuery(async () => (await workoutRepo.all()).sort((a, b) => b.startedAt - a.startedAt), []);
export const useWorkout = (id: string | undefined) => useLiveQuery(async () => (id ? ((await workoutRepo.get(id)) ?? null) : null), [id]);
export const useWorkoutSets = (id: string | undefined) => useLiveQuery(async () => (id ? setRepo.byWorkout(id) : []), [id]);
export const useAllSets = () => useLiveQuery(() => setRepo.all(), []);
export const usePrefs = () => useLiveQuery(() => prefsRepo.get(), []);
