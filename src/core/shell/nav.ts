/* Что показывать в меню и на «Сводке» с учётом выключенных разделов и выбора пунктов нижнего меню. */
import { useMemo } from 'react';
import type { ModuleManifest, ModuleNavItem } from '../module';
import { useSettings } from '../stores/settings';
import { MODULES } from '../../modules';

export const HOME: ModuleNavItem = { to: '/', label: 'Сводка', short: 'Сводка', icon: 'home', accent: 'var(--c-gold)' };
export const SETTINGS: ModuleNavItem = { to: '/settings', label: 'Настройки', short: 'Опции', icon: 'gear', accent: 'var(--c-text-dim)' };
export const MORE: ModuleNavItem = { to: '/more', label: 'Ещё', short: 'Ещё', icon: 'menu', accent: 'var(--c-text-dim)' };
/** Сколько разделов помещается в нижнее меню между «Сводкой» и «Ещё». */
export const MOBILE_SLOTS = 3;

/** Включённые разделы этой сборки. */
export function useModules(): readonly ModuleManifest[] {
  const off = useSettings((s) => s.settings.modulesOff);
  return useMemo(() => MODULES.filter((m) => !off.includes(m.id)), [off]);
}

/** Пункты нижнего меню телефона: «Сводка», выбранные разделы (до MOBILE_SLOTS), «Ещё». */
export function mobileItems(modules: readonly Pick<ModuleManifest, 'nav'>[], chosen: readonly string[]): ModuleNavItem[] {
  const all = modules.flatMap((m) => m.nav);
  const picked = chosen.map((to) => all.find((n) => n.to === to)).filter((n): n is ModuleNavItem => n !== undefined);
  // Выбранный пункт пропал (раздел выключен) — добираем первыми из оставшихся
  const rest = all.filter((n) => !picked.includes(n));
  return [HOME, ...[...picked, ...rest].slice(0, MOBILE_SLOTS), MORE];
}

export function useMobileNav(): ModuleNavItem[] {
  const modules = useModules();
  const chosen = useSettings((s) => s.settings.mobileNav);
  return useMemo(() => mobileItems(modules, chosen), [modules, chosen]);
}
