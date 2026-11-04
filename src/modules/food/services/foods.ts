/* Свои продукты и блюда. */
import type { SyncMeta } from '../../../core/domain/types';
import type { FoodItem } from '../domain/types';
import { itemRepo } from '../data/repo';

export const saveFood = (x: Omit<FoodItem, keyof SyncMeta> & Partial<SyncMeta>) => itemRepo.save(x);
export const deleteFood = (id: string) => itemRepo.remove(id);
