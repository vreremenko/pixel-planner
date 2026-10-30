/*
 * «Паспорт» раздела приложения. Ядро собирает из паспортов маршруты, меню и глобальные окна;
 * таблицы IndexedDB и напоминания модули регистрируют отдельно, без React (src/modules/tables.ts, reminders.ts).
 */
import { lazy, type ComponentType } from 'react';
import type { IconName } from './ui';

export interface ModuleNavItem {
  /** Абсолютный путь пункта меню ('/', '/habits'). */
  to: string;
  label: string;
  /** Подпись в нижнем меню телефона. */
  short: string;
  icon: IconName;
  /** Цвет раздела (CSS-переменная из tokens.css). */
  accent: string;
}

export interface ModuleRoute {
  /** Путь относительно корня ('habits', 'tag/:tag'); index — главная. */
  path?: string;
  index?: boolean;
  Component: ComponentType;
}

export interface ModuleManifest {
  id: string;
  title: string;
  /** draft — раздел в разработке: виден только в dev-сборке. */
  status?: 'ready' | 'draft';
  nav: ModuleNavItem[];
  routes: ModuleRoute[];
  /** Всегда смонтированные части раздела (общие окна, например редактор задачи). */
  globals?: ComponentType[];
}

/** Экран, который загружается только при первом открытии (свой кусок бандла). */
export function lazyScreen<M>(load: () => Promise<M>, pick: (m: M) => ComponentType): ComponentType {
  return lazy(async () => ({ default: pick(await load()) }));
}
