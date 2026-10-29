/**
 * Адрес push-API. По умолчанию — тот же сайт (/api/), как на Cloudflare Workers.
 * Если фронтенд лежит на другом хостинге (GitHub Pages), при сборке задаётся
 * VITE_API_BASE=https://<воркер>.workers.dev/
 */
const base: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? import.meta.env.BASE_URL;

export const apiUrl = (path: string): string => new URL(`api/${path}`, new URL(base, self.location.href)).href;
