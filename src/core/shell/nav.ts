/* Что показывать в меню и на «Сводке»: разделы сборки и пункты нижнего меню. */
import { useMemo } from 'react';
import type { ModuleManifest, ModuleNavItem } from '../module';
import { useAuth } from '../auth/store';
import { useSettings } from '../stores/settings';
import { MODULES } from '../../modules';

export const HOME: ModuleNavItem = { to: '/', label: 'Сводка', short: 'Сводка', icon: 'home', accent: 'var(--c-gold)' };
export const ACCOUNT: ModuleNavItem = { to: '/account', label: 'Личный кабинет', short: 'Кабинет', icon: 'user', accent: 'var(--c-habit)' };
export const ADMIN: ModuleNavItem = { to: '/admin', label: 'Админка', short: 'Админка', icon: 'shield', accent: 'var(--c-gold)' };
export const SETTINGS: ModuleNavItem = { to: '/settings', label: 'Настройки', short: 'Опции', icon: 'gear', accent: 'var(--c-text-dim)' };
export const MORE: ModuleNavItem = { to: '/more', label: 'Ещё', short: 'Ещё', icon: 'menu', accent: 'var(--c-text-dim)' };
/** Сколько разделов закрепляется в нижнем меню: кроме них там «Сводка», кнопка помощника и «Разделы». */
export const MOBILE_SLOTS = 2;

/** Показать ли админку. Настоящая проверка прав на сервере, здесь только пункт меню. */
export const useIsAdmin = (): boolean => useAuth((s) => Boolean(s.session?.user.admin));

/**
 * Разделы этой сборки. Все работают всегда: выключатель убран (аудит 2026-11-22) — новичку он ничего не давал,
 * а пустой раздел и так не мешает. Старое значение modulesOff в настройках больше ни на что не влияет.
 */
export function useModules(): readonly ModuleManifest[] {
  return MODULES;
}

/** Ссылки нижнего меню телефона: «Сводка» и выбранные разделы (до MOBILE_SLOTS); кнопку помощника и «Разделы» добавляет Layout. */
export function mobileItems(modules: readonly Pick<ModuleManifest, 'nav'>[], chosen: readonly string[]): ModuleNavItem[] {
  const all = modules.flatMap((m) => m.nav);
  // Ровно то, что выбрано в настройках: пункты выключенных разделов просто пропадают
  const picked = chosen.map((to) => all.find((n) => n.to === to)).filter((n): n is ModuleNavItem => n !== undefined);
  return [HOME, ...picked.slice(0, MOBILE_SLOTS)];
}

export function useMobileNav(): ModuleNavItem[] {
  const modules = useModules();
  const chosen = useSettings((s) => s.settings.mobileNav);
  return useMemo(() => mobileItems(modules, chosen), [modules, chosen]);
}
