/* Поиск и фильтр по группам для списков упражнений. */
import { useMemo, useState } from 'react';
import { useExercises } from './exercises';
import { GROUPS, type ExerciseGroup } from '../domain/types';

export type Filter = ExerciseGroup | 'all';
export const FILTERS = [{ value: 'all' as Filter, label: 'Все' }, ...Object.entries(GROUPS).map(([value, label]) => ({ value: value as Filter, label }))];

export function useExerciseFilter() {
  const ex = useExercises();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<Filter>('all');
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (ex?.list ?? []).filter((e) => (group === 'all' || e.group === group) && (!needle || e.name.toLowerCase().includes(needle)));
  }, [ex, q, group]);
  return { list, q, setQ, group, setGroup };
}

