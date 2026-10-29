/**
 * Адрес API сервера (`/api/…`). При сборке задаётся VITE_API_BASE (на GitHub Pages — адрес сервера из
 * переменной репозитория API_BASE); без неё запросы идут на тот же сайт, как в разработке (Vite проксирует /api).
 */
const base: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? import.meta.env.BASE_URL;

export const apiUrl = (path: string): string => new URL(`api/${path}`, new URL(base, self.location.href)).href;
