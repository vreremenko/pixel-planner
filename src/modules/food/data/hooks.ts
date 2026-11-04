import { useLiveQuery } from 'dexie-react-hooks';
import { addDays } from '../../../core/domain/dates';
import type { LocalDate } from '../../../core/domain/types';
import { entryRepo, itemRepo, prefsRepo } from './repo';

/** За сколько дней берём записи для подсказок «недавнее» и «частое». */
const HISTORY_DAYS = 60;

export const useDayEntries = (date: LocalDate) => useLiveQuery(() => entryRepo.byDate(date), [date]);
export const useHistory = (date: LocalDate) => useLiveQuery(() => entryRepo.byRange(addDays(date, -HISTORY_DAYS), date), [date]);
export const useFoodItems = () => useLiveQuery(() => itemRepo.all(), []);
export const useFoodPrefs = () => useLiveQuery(() => prefsRepo.get(), []);
