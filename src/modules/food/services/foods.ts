/* Свои продукты и блюда. */
import type { New } from '../../../core/data/repo';
import type { FoodItem } from '../domain/types';
import { itemRepo } from '../data/repo';

export const saveFood = (x: New<FoodItem>) => itemRepo.save(x);
export const deleteFood = (id: string) => itemRepo.remove(id);
