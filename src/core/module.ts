/*
 * «Паспорт» раздела приложения. Ядро собирает из паспортов маршруты, меню и глобальные окна;
 * таблицы IndexedDB и напоминания модули регистрируют отдельно, без React (src/modules/tables.ts, reminders.ts).
 */
import { lazy, type ComponentType } from 'react';
import type { IconName } from './ui';
import type { LocalDate } from './domain/types';

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

interface ModuleRoute {
  /** Путь относительно корня ('habits', 'tag/:tag'). Главная — «Сводка» ядра. */
  path: string;
  Component: ComponentType;
}

/** Карточка раздела на «Сводке». */
interface ModuleWidget {
  id: string;
  title: string;
  icon: IconName;
  accent: string;
  /** Куда ведёт заголовок карточки. */
  to: string;
  Component: ComponentType;
}

/** Строка в «Сегодня»: одно дело, привычка, платёж или тренировка дня. */
export interface TodayItem {
  id: string;
  title: string;
  /** ЧЧ:ММ; нет — «без времени». */
  time?: string | undefined;
  done: boolean;
  /** Куда ведёт нажатие на название. */
  to: string;
  icon: IconName;
  accent: string;
  /** Подпись под названием: сумма платежа, «просрочен», единица счётной привычки. */
  detail?: string | undefined;
  /** Отметка прямо из списка; нет — строка только открывает раздел. */
  toggle?: ((done: boolean) => Promise<void>) | undefined;
}

/** Одно число раздела в полосе над списком: «Дела 2 из 5», «1 200 ккал», «Можно тратить 1 036 ₽». */
export interface TodayStat {
  id: string;
  label: string;
  value: string;
  to: string;
  accent: string;
}

export interface TodayFeed {
  items: TodayItem[];
  stat?: TodayStat | undefined;
}

export interface ModuleManifest {
  id: string;
  title: string;
  icon: IconName;
  accent: string;
  /** draft — раздел в разработке: виден только в dev-сборке. */
  status?: 'ready' | 'draft';
  nav: ModuleNavItem[];
  routes: ModuleRoute[];
  /** Карточки раздела на «Сводке». */
  widgets?: ModuleWidget[];
  /**
   * Что раздел показывает в «Сегодня»: дела дня и одно число. Отдаёт функцию, которая читает таблицы раздела.
   * Сначала подгружается сама функция (отложенный модуль), а запросы к базе ядро делает уже со ссылкой на неё —
   * иначе живое обновление списка не заметит изменений в таблицах.
   */
  loadToday?: () => Promise<(today: LocalDate) => Promise<TodayFeed>>;
  /** Панель раздела в «Настройках». */
  settingsPanel?: ComponentType;
  /** Всегда смонтированные части раздела (общие окна, например редактор задачи). */
  globals?: ComponentType[];
}

/** Экран, который загружается только при первом открытии (свой кусок бандла). */
export function lazyScreen<M>(load: () => Promise<M>, pick: (m: M) => ComponentType): ComponentType {
  return lazy(async () => ({ default: pick(await load()) }));
}
