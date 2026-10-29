/* HTTP-API приложения: /api/sync, /api/devices/…, /api/config, /api/ping; /api/cron — вызывается расписанием */
import { getStore } from '@netlify/blobs';
import { BlobsStore } from '../../src/blobs-store.ts';
import { handle, sendDue, type Env } from '../../src/core.ts';

const env: Env = {
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
  VAPID_SUBJECT: process.env.VAPID_SUBJECT,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
};

export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const i = url.pathname.indexOf('/api/');
  const path = url.pathname.slice(i + 5).replace(/\/+$/, '');
  const store = new BlobsStore(getStore({ name: 'pp', consistency: 'strong' }));

  // Рассылка напоминаний. Её дёргает функция-расписание (cron.ts) с общим секретом: рассылка работает
  // в том же окружении, что и остальное API, и видит те же данные.
  if (path === 'cron') {
    const secret = process.env.CRON_SECRET;
    if (req.method !== 'POST' || !secret || req.headers.get('x-cron-secret') !== secret) return new Response('forbidden', { status: 403 });
    const sent = await sendDue({ store, env });
    return new Response(JSON.stringify({ sent }), { headers: { 'content-type': 'application/json' } });
  }

  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
  const body = req.method === 'GET' || req.method === 'HEAD' ? '' : await req.text();
  const res = await handle({ method: req.method, path, query: Object.fromEntries(url.searchParams), headers, body }, { store, env });
  return new Response(res.status === 204 ? null : res.body, { status: res.status, headers: res.headers });
};

export const config = { path: '/api/*' };
