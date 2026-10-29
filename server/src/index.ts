/*
 * PIXEL PLANNER — push-сервер (этап Б).
 * Один Cloudflare Worker: раздаёт собранный фронтенд (static assets),
 * принимает подписки и расписание напоминаний (/api/*), а cron раз в минуту
 * рассылает наступившие напоминания через Web Push.
 */
import { buildPushPayload, type PushSubscription } from '@block65/webcrypto-web-push';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  /** Через запятую: откуда разрешены запросы к API (фронтенд на другом домене, напр. GitHub Pages). */
  ALLOWED_ORIGINS?: string;
}

const MAX_ITEMS = 500;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_SYNC_BODY_BYTES = 900 * 1024;
const MAX_SYNC_RECORDS = 300;
/** Пачка записей в ответе не больше ~10 КБ: провайдеры в России режут ответы крупнее ~16 КБ (см. README). */
const MAX_SYNC_PULL = 40;
const MAX_SYNC_PULL_BYTES = 10_000;
const SYNC_TABLES = new Set(['tasks', 'series', 'overrides', 'habits', 'habitLogs', 'xp', 'achievements']);
const SYNC_KEY = /^[A-Za-z0-9_-]{43}$/;
/** Напоминания старше этого не отправляем: устарели. */
const STALE_MS = 6 * 3_600_000;
const KINDS = new Set(['task', 'occurrence', 'habit', 'summary']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ScheduleItem {
  key: string;
  fireAt: number;
  kind: string;
  ref: string;
  date: string;
  title: string;
  body: string;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

const str = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null;

async function readJson(req: Request, limit = MAX_BODY_BYTES): Promise<unknown> {
  const text = await req.text();
  if (text.length > limit) throw new HttpError(413, 'too large');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, 'bad json');
  }
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
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

async function deviceExists(env: Env, id: string) {
  return (await env.DB.prepare('SELECT 1 FROM devices WHERE id = ?').bind(id).first()) !== null;
}

/** Пространство данных = SHA-256 ключа из заголовка Authorization: Bearer <ключ>. */
async function syncSpace(req: Request): Promise<string> {
  const key = /^Bearer (\S+)$/.exec(req.headers.get('authorization') ?? '')?.[1];
  if (!key || !SYNC_KEY.test(key)) throw new HttpError(401, 'bad sync key');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface SyncIn {
  t: string;
  id: string;
  u: number;
  d: string;
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

async function handleSync(req: Request, env: Env, url: URL): Promise<Response> {
  const space = await syncSpace(req);

  // GET /api/sync?after=<seq> — всё, что изменилось после курсора
  if (req.method === 'GET') {
    const after = Math.max(0, Number(url.searchParams.get('after') ?? 0) || 0);
    const { results } = await env.DB.prepare(
      'SELECT seq, tbl AS t, rid AS id, updated_at AS u, data AS d FROM sync_records WHERE space = ? AND seq > ? ORDER BY seq LIMIT ?',
    )
      .bind(space, after, MAX_SYNC_PULL + 1)
      .all<{ seq: number; t: string; id: string; u: number; d: string }>();
    // Берём записи, пока не набралось ~10 КБ (но хотя бы одну), остальное — со следующим запросом
    const records: typeof results = [];
    let bytes = 0;
    for (const r of results.slice(0, MAX_SYNC_PULL)) {
      if (records.length > 0 && bytes + r.d.length > MAX_SYNC_PULL_BYTES) break;
      records.push(r);
      bytes += r.d.length;
    }
    const more = records.length < results.length;
    return json({ records, cursor: records.at(-1)?.seq ?? after, more });
  }

  // PUT /api/sync — принять изменения; побеждает запись с большим updatedAt
  if (req.method === 'PUT') {
    const b = (await readJson(req, MAX_SYNC_BODY_BYTES)) as { records?: unknown[] };
    if (!Array.isArray(b.records)) throw new HttpError(400, 'records required');
    const records = b.records.slice(0, MAX_SYNC_RECORDS).map(parseSyncRecord).filter((x): x is SyncIn => x !== null);
    if (records.length > 0) {
      // Один запрос на всю пачку: у бесплатного плана ограничено число запросов к D1 на вызов
      await env.DB.prepare(
        `INSERT OR REPLACE INTO sync_records (space, tbl, rid, updated_at, data)
         SELECT ?1, json_extract(j.value, '$.t'), json_extract(j.value, '$.id'), json_extract(j.value, '$.u'), json_extract(j.value, '$.d')
         FROM json_each(?2) AS j
         WHERE NOT EXISTS (
           SELECT 1 FROM sync_records s
           WHERE s.space = ?1 AND s.tbl = json_extract(j.value, '$.t') AND s.rid = json_extract(j.value, '$.id')
             AND s.updated_at >= json_extract(j.value, '$.u')
         )`,
      )
        .bind(space, JSON.stringify(records))
        .run();
    }
    return json({ ok: true, count: records.length });
  }

  // DELETE /api/sync — стереть всё, что лежит на сервере для этого ключа
  if (req.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM sync_records WHERE space = ?').bind(space).run();
    return json({ ok: true });
  }

  throw new HttpError(405, 'method not allowed');
}

async function handleApi(req: Request, env: Env, url: URL): Promise<Response> {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]

  if (req.method === 'GET' && parts[1] === 'config') {
    return json({ vapidPublicKey: env.VAPID_PUBLIC_KEY, push: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) });
  }

  // GET /api/ping?kb=N — ответ заданного размера: проверить, проходят ли с этого устройства крупные ответы
  if (req.method === 'GET' && parts[1] === 'ping') {
    const kb = Math.min(256, Math.max(0, Math.floor(Number(url.searchParams.get('kb') ?? 1)) || 0));
    return new Response('x'.repeat(kb * 1024), { headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } });
  }

  if (parts[1] === 'sync' && parts.length === 2) return handleSync(req, env, url);

  if (parts[1] !== 'devices') throw new HttpError(404, 'not found');
  const id = parts[2];
  if (!id || !UUID.test(id)) throw new HttpError(400, 'bad device id');
  const now = Date.now();

  // PUT /api/devices/:id — регистрация/обновление подписки
  if (parts.length === 3 && req.method === 'PUT') {
    const b = (await readJson(req)) as { subscription?: PushSubscription };
    const sub = b.subscription;
    const endpoint = str(sub?.endpoint, 1000);
    const p256dh = str(sub?.keys.p256dh, 200);
    const auth = str(sub?.keys.auth, 100);
    if (!endpoint?.startsWith('https://') || !p256dh || !auth) throw new HttpError(400, 'bad subscription');
    await env.DB.prepare(
      `INSERT INTO devices (id, endpoint, p256dh, auth, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT(id) DO UPDATE SET endpoint = ?2, p256dh = ?3, auth = ?4, updated_at = ?5`,
    )
      .bind(id, endpoint, p256dh, auth, now)
      .run();
    return json({ ok: true });
  }

  // DELETE /api/devices/:id — отписка, удаляем всё
  if (parts.length === 3 && req.method === 'DELETE') {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM reminders WHERE device_id = ?').bind(id),
      env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(id),
    ]);
    return json({ ok: true });
  }

  if (!(await deviceExists(env, id))) throw new HttpError(404, 'unknown device');

  // PUT /api/devices/:id/schedule — заменить будущее расписание
  if (parts[3] === 'schedule' && req.method === 'PUT') {
    const b = (await readJson(req)) as { items?: unknown[] };
    if (!Array.isArray(b.items)) throw new HttpError(400, 'items required');
    const items = b.items.slice(0, MAX_ITEMS).map(parseItem).filter((x): x is ScheduleItem => x !== null);
    const stmts = [
      env.DB.prepare('DELETE FROM reminders WHERE device_id = ? AND sent = 0').bind(id),
      env.DB.prepare('DELETE FROM reminders WHERE device_id = ? AND sent = 1 AND fire_at < ?').bind(id, now - 3 * 86_400_000),
      // OR IGNORE: уже отправленные с тем же ключом не дублируем
      ...items.map((it) =>
        env.DB.prepare(
          'INSERT OR IGNORE INTO reminders (device_id, key, fire_at, kind, ref, date, title, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ).bind(id, it.key, it.fireAt, it.kind, it.ref, it.date, it.title, it.body),
      ),
    ];
    await env.DB.batch(stmts);
    return json({ ok: true, count: items.length });
  }

  // POST /api/devices/:id/test — отправить тестовый push сразу (диагностика)
  if (parts[3] === 'test' && req.method === 'POST') {
    const d = await env.DB.prepare('SELECT endpoint, p256dh, auth FROM devices WHERE id = ?').bind(id).first<PushTarget>();
    if (!d) throw new HttpError(404, 'unknown device');
    const r = await sendOne(env, d, {
      key: `test:${String(now)}`, kind: 'summary', ref: '', date: '', title: 'PIXEL PLANNER', body: 'Push работает! ★', fireAt: now,
    });
    return json({ ok: r.status < 300, status: r.status, detail: r.detail, service: new URL(d.endpoint).host });
  }

  // POST /api/devices/:id/snooze — «Отложить на 10 минут» из уведомления
  if (parts[3] === 'snooze' && req.method === 'POST') {
    const it = parseItem(await readJson(req));
    if (!it) throw new HttpError(400, 'bad item');
    const key = `${it.key}#snooze${String(it.fireAt)}`;
    await env.DB.prepare(
      'INSERT OR REPLACE INTO reminders (device_id, key, fire_at, kind, ref, date, title, body, sent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)',
    )
      .bind(id, key, it.fireAt, it.kind, it.ref, it.date, it.title, it.body)
      .run();
    return json({ ok: true });
  }

  throw new HttpError(404, 'not found');
}

interface DueRow {
  device_id: string;
  key: string;
  fire_at: number;
  kind: string;
  ref: string;
  date: string;
  title: string;
  body: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Отправить один push. Возвращает HTTP-статус push-сервиса (Apple/Google/Mozilla). */
async function sendOne(env: Env, to: PushTarget, data: unknown): Promise<{ status: number; detail: string }> {
  const vapid = { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  const subscription: PushSubscription = { endpoint: to.endpoint, expirationTime: null, keys: { p256dh: to.p256dh, auth: to.auth } };
  const payload = await buildPushPayload({ data: JSON.stringify(data), options: { ttl: 3600, urgency: 'high' } }, subscription, vapid);
  const res = await fetch(to.endpoint, payload);
  const detail = res.ok ? '' : (await res.text()).slice(0, 300);
  if (!res.ok) console.warn('push failed', res.status, new URL(to.endpoint).host, detail);
  return { status: res.status, detail };
}

export async function sendDue(env: Env, now = Date.now()): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT r.device_id, r.key, r.fire_at, r.kind, r.ref, r.date, r.title, r.body, d.endpoint, d.p256dh, d.auth
     FROM reminders r JOIN devices d ON d.id = r.device_id
     WHERE r.sent = 0 AND r.fire_at <= ? ORDER BY r.fire_at LIMIT 200`,
  )
    .bind(now)
    .all<DueRow>();

  const goneDevices = new Set<string>();
  const retry = new Set<string>();
  let sent = 0;

  await Promise.all(
    results.map(async (r) => {
      if (now - r.fire_at > STALE_MS || goneDevices.has(r.device_id)) return;
      const data = { key: r.key.split('#snooze')[0], kind: r.kind, ref: r.ref, date: r.date, title: r.title, body: r.body, fireAt: r.fire_at };
      try {
        const { status } = await sendOne(env, r, data);
        console.log('push', status, new URL(r.endpoint).host, r.key);
        if (status === 404 || status === 410) goneDevices.add(r.device_id);
        else if (status < 300) sent++;
        // Временные ошибки (лимиты, сбои сервиса) — повторим в следующую минуту
        else if (status === 429 || status >= 500) retry.add(`${r.device_id}|${r.key}`);
      } catch (e) {
        console.warn('push error', e);
        retry.add(`${r.device_id}|${r.key}`);
      }
    }),
  );

  const stmts = results
    .filter((r) => !retry.has(`${r.device_id}|${r.key}`) || now - r.fire_at > STALE_MS)
    .map((r) => env.DB.prepare('UPDATE reminders SET sent = 1 WHERE device_id = ? AND key = ?').bind(r.device_id, r.key));
  for (const id of goneDevices) {
    stmts.push(env.DB.prepare('DELETE FROM reminders WHERE device_id = ?').bind(id));
    stmts.push(env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(id));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return sent;
}

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('origin');
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

function withCors(res: Response, cors: Record<string, string>): Response {
  if (Object.keys(cors).length === 0) return res;
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
  return out;
}

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      return withCors(await handleApi(req, env, url), cors);
    } catch (e) {
      if (e instanceof HttpError) return withCors(json({ error: e.message }, e.status), cors);
      console.error(e);
      return withCors(json({ error: 'internal' }, 500), cors);
    }
  },
  scheduled(_event, env, ctx): void {
    ctx.waitUntil(sendDue(env));
  },
} satisfies ExportedHandler<Env>;
