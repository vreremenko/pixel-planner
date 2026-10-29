/*
 * PIXEL PLANNER — сервер для своего сервера (Node.js): та же логика, что у Cloudflare Worker (server/src/index.ts),
 * но без привязки к платформе: запрос и хранилище приходят снаружи, поэтому её можно проверять тестами
 * (хранилище в памяти — memory-store.ts, боевое — sqlite-store.ts на SQLite).
 */
import { createHash } from 'node:crypto';
import { buildPushPayload, type PushSubscription } from '@block65/webcrypto-web-push';
import type { DueRow, HttpReq, HttpRes, ScheduleItem, Store, SyncIn } from './types.ts';

export interface Env {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  /** Через запятую: откуда разрешены запросы (фронтенд на GitHub Pages). */
  ALLOWED_ORIGINS?: string;
}

export interface Deps {
  store: Store;
  env: Env;
  now?: () => number;
  /** Отправка push; в тестах подменяется. */
  send?: (env: Env, to: { endpoint: string; p256dh: string; auth: string }, data: unknown) => Promise<{ status: number; detail: string }>;
}

const MAX_ITEMS = 500;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_SYNC_BODY_BYTES = 900 * 1024;
const MAX_SYNC_RECORDS = 300;
/** За один запрос отдаём не больше 300 записей и ~500 КБ; остальное клиент заберёт следующим запросом (`more`). */
const MAX_SYNC_PULL = 300;
const MAX_SYNC_PULL_BYTES = 500_000;
const STALE_MS = 6 * 3_600_000;
const SYNC_TABLES = new Set(['tasks', 'series', 'overrides', 'habits', 'habitLogs', 'xp', 'achievements']);
const SYNC_KEY = /^[A-Za-z0-9_-]{43}$/;
const KINDS = new Set(['task', 'occurrence', 'habit', 'summary']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const json = (data: unknown, status = 200): HttpRes => ({ status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null);

function readJson(body: string, limit = MAX_BODY_BYTES): unknown {
  if (body.length > limit) throw new HttpError(413, 'too large');
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new HttpError(400, 'bad json');
  }
}

function parseItem(x: unknown): ScheduleItem | null {
  if (typeof x !== 'object' || x === null) return null;
  const o = x as Record<string, unknown>;
  const key = str(o.key, 200);
  const title = str(o.title, 200);
  const body = typeof o.body === 'string' ? o.body.slice(0, 500) : '';
  const kind = str(o.kind, 20);
  const fireAt = typeof o.fireAt === 'number' && Number.isFinite(o.fireAt) ? Math.floor(o.fireAt) : null;
  const ref = typeof o.ref === 'string' ? o.ref.slice(0, 200) : '';
  const date = typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : '';
  if (!key || !title || !kind || !KINDS.has(kind) || fireAt === null) return null;
  return { key, title, body, kind, fireAt, ref, date };
}

function parseSyncRecord(x: unknown): SyncIn | null {
  if (typeof x !== 'object' || x === null) return null;
  const o = x as Record<string, unknown>;
  if (typeof o.t !== 'string' || !SYNC_TABLES.has(o.t)) return null;
  if (typeof o.id !== 'string' || o.id.length === 0 || o.id.length > 200) return null;
  if (typeof o.u !== 'number' || !Number.isFinite(o.u)) return null;
  if (typeof o.d !== 'string' || o.d.length > 20_000) return null;
  return { t: o.t, id: o.id, u: Math.floor(o.u), d: o.d };
}

/** Пространство данных = SHA-256 ключа из заголовка Authorization: Bearer <ключ>. */
function syncSpace(req: HttpReq): string {
  const key = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1];
  if (!key || !SYNC_KEY.test(key)) throw new HttpError(401, 'bad sync key');
  return createHash('sha256').update(key).digest('hex');
}

async function handleSync(req: HttpReq, d: Deps): Promise<HttpRes> {
  const space = syncSpace(req);
  if (req.method === 'GET') {
    const after = Math.max(0, Number(req.query.after ?? 0) || 0);
    const rows = await d.store.syncPull(space, after, MAX_SYNC_PULL + 1);
    const records: typeof rows = [];
    let bytes = 0;
    for (const r of rows.slice(0, MAX_SYNC_PULL)) {
      if (records.length > 0 && bytes + r.d.length > MAX_SYNC_PULL_BYTES) break;
      records.push(r);
      bytes += r.d.length;
    }
    return json({ records, cursor: records.at(-1)?.seq ?? after, more: records.length < rows.length });
  }
  if (req.method === 'PUT') {
    const b = readJson(req.body, MAX_SYNC_BODY_BYTES) as { records?: unknown[] };
    if (!Array.isArray(b.records)) throw new HttpError(400, 'records required');
    const records = b.records.slice(0, MAX_SYNC_RECORDS).map(parseSyncRecord).filter((x): x is SyncIn => x !== null);
    if (records.length > 0) await d.store.syncPush(space, records);
    return json({ ok: true, count: records.length });
  }
  if (req.method === 'DELETE') {
    await d.store.syncDelete(space);
    return json({ ok: true });
  }
  throw new HttpError(405, 'method not allowed');
}

async function sendOne(env: Env, to: { endpoint: string; p256dh: string; auth: string }, data: unknown): Promise<{ status: number; detail: string }> {
  const vapid = { subject: env.VAPID_SUBJECT ?? '', publicKey: env.VAPID_PUBLIC_KEY ?? '', privateKey: env.VAPID_PRIVATE_KEY ?? '' };
  const subscription: PushSubscription = { endpoint: to.endpoint, expirationTime: null, keys: { p256dh: to.p256dh, auth: to.auth } };
  const payload = await buildPushPayload({ data: JSON.stringify(data), options: { ttl: 3600, urgency: 'high' } }, subscription, vapid);
  const res = await fetch(to.endpoint, payload);
  const detail = res.ok ? '' : (await res.text()).slice(0, 300);
  if (!res.ok) console.warn('push failed', res.status, new URL(to.endpoint).host, detail);
  return { status: res.status, detail };
}

async function handleApi(req: HttpReq, d: Deps): Promise<HttpRes> {
  const parts = req.path.split('/').filter(Boolean);
  const now = (d.now ?? Date.now)();
  const send = d.send ?? sendOne;

  if (req.method === 'GET' && parts[0] === 'config') {
    return json({ vapidPublicKey: d.env.VAPID_PUBLIC_KEY, push: Boolean(d.env.VAPID_PUBLIC_KEY && d.env.VAPID_PRIVATE_KEY) });
  }
  if (parts[0] === 'sync' && parts.length === 1) return handleSync(req, d);

  if (parts[0] !== 'devices') throw new HttpError(404, 'not found');
  const id = parts[1];
  if (!id || !UUID.test(id)) throw new HttpError(400, 'bad device id');

  if (parts.length === 2 && req.method === 'PUT') {
    const b = readJson(req.body) as { subscription?: PushSubscription };
    const sub = b.subscription;
    const endpoint = str(sub?.endpoint, 1000);
    const p256dh = str(sub?.keys.p256dh, 200);
    const auth = str(sub?.keys.auth, 100);
    if (!endpoint?.startsWith('https://') || !p256dh || !auth) throw new HttpError(400, 'bad subscription');
    await d.store.deviceUpsert({ id, endpoint, p256dh, auth, now });
    return json({ ok: true });
  }
  if (parts.length === 2 && req.method === 'DELETE') {
    await d.store.deviceDelete(id);
    return json({ ok: true });
  }

  if (!(await d.store.deviceExists(id))) throw new HttpError(404, 'unknown device');

  if (parts[2] === 'schedule' && req.method === 'PUT') {
    const b = readJson(req.body) as { items?: unknown[] };
    if (!Array.isArray(b.items)) throw new HttpError(400, 'items required');
    const items = b.items.slice(0, MAX_ITEMS).map(parseItem).filter((x): x is ScheduleItem => x !== null);
    await d.store.scheduleReplace(id, items, now);
    return json({ ok: true, count: items.length });
  }
  if (parts[2] === 'test' && req.method === 'POST') {
    const dev = await d.store.deviceGet(id);
    if (!dev) throw new HttpError(404, 'unknown device');
    const r = await send(d.env, dev, { key: `test:${String(now)}`, kind: 'summary', ref: '', date: '', title: 'PIXEL PLANNER', body: 'Push работает! ★', fireAt: now });
    return json({ ok: r.status < 300, status: r.status, detail: r.detail, service: new URL(dev.endpoint).host });
  }
  if (parts[2] === 'snooze' && req.method === 'POST') {
    const it = parseItem(readJson(req.body));
    if (!it) throw new HttpError(400, 'bad item');
    await d.store.reminderSnooze(id, { ...it, key: `${it.key}#snooze${String(it.fireAt)}` });
    return json({ ok: true });
  }
  throw new HttpError(404, 'not found');
}

function corsHeaders(req: HttpReq, env: Env): Record<string, string> {
  const origin = req.headers.origin;
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

/** Точка входа HTTP: запрос → ответ, с CORS и обработкой ошибок. */
export async function handle(req: HttpReq, d: Deps): Promise<HttpRes> {
  const cors = corsHeaders(req, d.env);
  if (req.method === 'OPTIONS') return { status: 204, headers: cors, body: '' };
  try {
    const res = await handleApi(req, d);
    return { ...res, headers: { ...res.headers, ...cors } };
  } catch (e) {
    if (e instanceof HttpError) return { ...json({ error: e.message }, e.status), headers: { 'content-type': 'application/json', ...cors } };
    console.error(e);
    return { ...json({ error: 'internal' }, 500), headers: { 'content-type': 'application/json', ...cors } };
  }
}

/** Рассылка наступивших напоминаний (запускается таймером раз в минуту). */
export async function sendDue(d: Deps): Promise<number> {
  const now = (d.now ?? Date.now)();
  const send = d.send ?? sendOne;
  const due: DueRow[] = await d.store.dueReminders(now, 200);
  const gone = new Set<string>();
  const retry = new Set<string>();
  let sent = 0;
  await Promise.all(
    due.map(async (r) => {
      if (now - r.fireAt > STALE_MS || gone.has(r.deviceId)) return;
      const data = { key: r.key.split('#snooze')[0], kind: r.kind, ref: r.ref, date: r.date, title: r.title, body: r.body, fireAt: r.fireAt };
      try {
        const { status } = await send(d.env, r, data);
        if (status === 404 || status === 410) gone.add(r.deviceId);
        else if (status < 300) sent++;
        else if (status === 429 || status >= 500) retry.add(`${r.deviceId}|${r.key}`);
      } catch (e) {
        console.warn('push error', e);
        retry.add(`${r.deviceId}|${r.key}`);
      }
    }),
  );
  const done = due.filter((r) => !retry.has(`${r.deviceId}|${r.key}`) || now - r.fireAt > STALE_MS).map((r) => ({ deviceId: r.deviceId, key: r.key }));
  if (done.length > 0) await d.store.markSent(done);
  for (const id of gone) await d.store.deviceDelete(id);
  return sent;
}
