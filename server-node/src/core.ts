/*
 * PIXEL PLANNER — сервер для своего сервера (Node.js): та же логика, что у Cloudflare Worker (server/src/index.ts),
 * но без привязки к платформе: запрос и хранилище приходят снаружи, поэтому её можно проверять тестами
 * (хранилище в памяти — memory-store.ts, боевое — sqlite-store.ts на SQLite).
 */
import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { buildPushPayload, type PushSubscription } from '@block65/webcrypto-web-push';
import { PASSWORD_MAX, RateLimiter, TOKEN_RE, dummyHash, hashPassword, isValidEmail, isValidPassword, newToken, normalizeEmail, tokenHash, verifyPassword } from './auth.ts';
import { buildStats, dayOf } from './admin.ts';
import type { SendMail } from './mail.ts';
import { parseUpdate, type BotEvent, type TelegramApi } from './telegram.ts';
import { checkInitData, isTelegramOnly, telegramEmail } from './webapp.ts';
import type { CodeKind, DueRow, HttpReq, HttpRes, ScheduleItem, Store, SyncIn } from './types.ts';
import { SYNC_TABLES } from '../../src/shared/syncTables.ts';

export interface Env {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  /** Через запятую: откуда разрешены запросы (фронтенд на GitHub Pages). */
  ALLOWED_ORIGINS?: string;
  /** Через запятую: почты админов. Хранится в настройках сервера, а не в коде: репозиторий открытый. */
  ADMIN_EMAILS?: string;
  /** Адрес бота без @. */
  TELEGRAM_BOT_NAME?: string;
  /** Нужен, чтобы проверять подпись данных Mini App. */
  TELEGRAM_BOT_TOKEN?: string;
  /** Адрес приложения для кнопки в боте. */
  APP_URL?: string;
  /** Этим ключом посредник подтверждает, что обновление пришло через него. */
  TELEGRAM_RELAY_KEY?: string;
}

export interface Deps {
  store: Store;
  env: Env;
  now?: () => number;
  /** Ограничитель попыток входа и регистраций; в тестах подменяется, чтобы они не влияли друг на друга. */
  limiter?: RateLimiter;
  /** Запрос к Open Food Facts и кэш его ответов; в тестах подменяются. */
  offFetch?: typeof fetch;
  offCache?: Map<string, OffCached>;
  /** Отправка писем; без неё коды не выдаются. */
  sendMail?: SendMail;
  /** Бот; без него вход через Telegram выключен. */
  telegram?: TelegramApi;
  /** Отправка push; в тестах подменяется. */
  send?: (env: Env, to: { endpoint: string; p256dh: string; auth: string }, data: unknown) => Promise<{ status: number; detail: string }>;
}

const DAY_MS = 86_400_000;
const MAX_ITEMS = 500;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_SYNC_BODY_BYTES = 900 * 1024;
const MAX_SYNC_RECORDS = 300;
/** Потолок записей на аккаунт: обычному человеку хватит на много лет, а диск сервера одним аккаунтом не забить. */
const MAX_SYNC_TOTAL = 50_000;
/** За один запрос отдаём не больше 300 записей и ~500 КБ; остальное клиент заберёт следующим запросом (`more`). */
const MAX_SYNC_PULL = 300;
const MAX_SYNC_PULL_BYTES = 500_000;
const STALE_MS = 6 * 3_600_000;
const SYNC_TABLE_SET = new Set<string>(SYNC_TABLES);
/** Сессия живёт, пока ею пользуются: не заходили больше года — нужно войти заново. */
const SESSION_MAX_IDLE_MS = 365 * 86_400_000;
const LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_MAX_PER_EMAIL = 8;
const LOGIN_MAX_PER_IP = 40;
const REGISTER_WINDOW_MS = 3_600_000;
const REGISTER_MAX_PER_IP = 10;
const CODE_TTL_MS = 15 * 60_000;
const CODE_RESEND_MS = 60_000;
const CODE_MAX_ATTEMPTS = 5;
const TG_CODE_TTL_MS = 10 * 60_000;
/** Напоминания в Telegram хранятся как ещё одно устройство пользователя с таким адресом вместо push-подписки. */
const TG_ENDPOINT = 'tg:';
const DEFAULT_APP_URL = 'https://vreremenko.github.io/pixel-planner/';
const FEEDBACK_WINDOW_MS = 3_600_000;
const FEEDBACK_MAX = 5;
const FEEDBACK_MAX_LENGTH = 2000;
const TG_START_MAX_PER_IP = 30;
const RESET_WINDOW_MS = 3_600_000;
const RESET_MAX_PER_IP = 20;
/** На одну почту: иначе код из шести цифр можно подбирать с множества адресов, а ящик владельца заваливать письмами. */
const RESET_MAX_REQUESTS_PER_EMAIL = 5;
const RESET_MAX_FAILS_PER_EMAIL = 10;
const EMAIL_MAX = 254;
/**
 * Куда сервер согласен слать push: только службы уведомлений браузеров. Иначе адрес подписки —
 * способ заставить сервер ходить по чужим и внутренним адресам (SSRF).
 */
const PUSH_HOSTS = ['fcm.googleapis.com', '.push.apple.com', '.push.services.mozilla.com', '.notify.windows.com'];
const isPushEndpoint = (endpoint: string): boolean => {
  try {
    const { protocol, hostname } = new URL(endpoint);
    return protocol === 'https:' && PUSH_HOSTS.some((h) => (h.startsWith('.') ? hostname.endsWith(h) : hostname === h));
  } catch {
    return false;
  }
};
/** Вид напоминания задаёт модуль клиента ('task', 'habit'…) — проверяем только форму. */
const KIND_RE = /^[a-z][a-zA-Z0-9_-]{0,31}$/;
const VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Поиск продуктов: приложение идёт сюда, потому что из России Open Food Facts напрямую не открывается. */
const OFF_SEARCH = 'https://search.openfoodfacts.org/search';
const OFF_USER_AGENT = 'PixelPlanner/1.0 (https://github.com/vreremenko/pixel-planner)';
const OFF_TIMEOUT_MS = 8_000;
const OFF_CACHE_MS = 86_400_000;
const OFF_CACHE_MAX = 500;
const OFF_WINDOW_MS = 60_000;
const OFF_MAX_PER_IP = 30;
const OFF_QUERY_MAX = 80;

interface OffCached {
  at: number;
  body: string;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const defaultLimiter = new RateLimiter();
const defaultOffCache = new Map<string, OffCached>();

/** Ответы с данными не должны оседать ни в чьём кэше. */
const SAFE_HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const json = (data: unknown, status = 200): HttpRes => ({ status, headers: { ...SAFE_HEADERS }, body: JSON.stringify(data) });
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
  if (!key || !title || !kind || !KIND_RE.test(kind) || fireAt === null) return null;
  return { key, title, body, kind, fireAt, ref, date };
}

function parseSyncRecord(x: unknown): SyncIn | null {
  if (typeof x !== 'object' || x === null) return null;
  const o = x as Record<string, unknown>;
  if (typeof o.t !== 'string' || !SYNC_TABLE_SET.has(o.t)) return null;
  if (typeof o.id !== 'string' || o.id.length === 0 || o.id.length > 200) return null;
  if (typeof o.u !== 'number' || !Number.isFinite(o.u)) return null;
  if (typeof o.d !== 'string' || o.d.length > 20_000) return null;
  return { t: o.t, id: o.id, u: Math.floor(o.u), d: o.d };
}

/** Пользователь по токену сессии из заголовка Authorization: Bearer <токен>. */
async function requireUser(req: HttpReq, d: Deps): Promise<{ userId: string; token: string }> {
  const token = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1];
  if (!token || !TOKEN_RE.test(token)) throw new HttpError(401, 'unauthorized');
  const now = (d.now ?? Date.now)();
  const userId = await d.store.sessionUser(tokenHash(token), now, SESSION_MAX_IDLE_MS);
  if (!userId) throw new HttpError(401, 'unauthorized');
  await d.store.activityTouch(userId, dayOf(now));
  return { userId, token };
}

const adminEmails = (env: Env): string[] => (env.ADMIN_EMAILS ?? '').split(',').map(normalizeEmail).filter(Boolean);
/** Админ — почта из настроек сервера, и она подтверждена: иначе права достались бы тому, кто первым зарегистрирует этот адрес. */
const isAdmin = (u: { email: string; emailVerified?: boolean }, env: Env): boolean => Boolean(u.emailVerified) && adminEmails(env).includes(u.email);

/** Права админа определяет только сервер: скрытая вкладка в приложении ничего не защищает. */
async function handleAdmin(req: HttpReq, d: Deps, now: number): Promise<HttpRes> {
  const { userId } = await requireUser(req, d);
  const admins = adminEmails(d.env);
  const user = await d.store.userById(userId);
  if (!user || !isAdmin(user, d.env)) throw new HttpError(403, 'forbidden');
  const [users, activity, records] = await Promise.all([d.store.adminUsers(), d.store.activitySince(dayOf(now - 30 * DAY_MS)), d.store.adminRecords(now - 7 * DAY_MS)]);
  return json(buildStats({ now, admins, users, activity, records }));
}

/** Ответ Open Food Facts без лишних полей; одинаковые запросы разных пользователей уходят туда один раз в сутки. */
async function handleFoodSearch(req: HttpReq, d: Deps, now: number): Promise<HttpRes> {
  // Служебные знаки языка запросов сервис принимает за синтаксис и отвечает ошибкой
  const q = (req.query.q ?? '').replace(/[^\p{L}\p{N}%.,-]+/gu, ' ').trim().toLowerCase().slice(0, OFF_QUERY_MAX);
  if (q.length < 2) throw new HttpError(400, 'bad query');
  const cache = d.offCache ?? defaultOffCache;
  const hit = cache.get(q);
  if (hit && now - hit.at < OFF_CACHE_MS) return { status: 200, headers: { ...SAFE_HEADERS }, body: hit.body };

  const limiter = d.limiter ?? defaultLimiter;
  const key = `off:${req.ip ?? 'unknown'}`;
  if (limiter.count(key, OFF_WINDOW_MS, now) >= OFF_MAX_PER_IP) throw new HttpError(429, 'too many searches');
  limiter.add(key, now);

  const params = new URLSearchParams({ q, langs: 'ru', page_size: '20', fields: 'code,product_name,brands,nutriments' });
  let data: { hits?: unknown[] };
  try {
    const res = await (d.offFetch ?? fetch)(`${OFF_SEARCH}?${params.toString()}`, { headers: { 'user-agent': OFF_USER_AGENT }, signal: AbortSignal.timeout(OFF_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`off ${String(res.status)}`);
    data = (await res.json()) as { hits?: unknown[] };
  } catch (e) {
    console.warn('поиск Open Food Facts не удался', e);
    throw new HttpError(502, 'off unavailable');
  }
  const body = JSON.stringify({ products: data.hits ?? [] });
  cache.delete(q);
  cache.set(q, { at: now, body });
  if (cache.size > OFF_CACHE_MAX) for (const old of cache.keys()) {
    cache.delete(old);
    break;
  }
  return { status: 200, headers: { ...SAFE_HEADERS }, body };
}

async function handleSync(req: HttpReq, d: Deps): Promise<HttpRes> {
  const { userId: space } = await requireUser(req, d);
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
    if (records.length > 0 && (await d.store.syncCount(space)) + records.length > MAX_SYNC_TOTAL) throw new HttpError(413, 'quota');
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


const bad = (status: number, error: string) => new HttpError(status, error);

const sha = (text: string) => createHash('sha256').update(text).digest();
const safeEqual = (a: string, b: string): boolean => timingSafeEqual(sha(a), sha(b));

const publicUser = (u: { id: string; email: string; emailVerified?: boolean; telegramId?: string | null }, env: Env) => ({ id: u.id, email: u.email, emailVerified: Boolean(u.emailVerified), telegram: Boolean(u.telegramId), ...(isTelegramOnly(u.email) ? { telegramOnly: true } : {}), ...(isAdmin(u, env) ? { admin: true } : {}) });

/** Выдать устройству новую сессию. */
async function openSession(d: Deps, userId: string, device: string): Promise<string> {
  const token = newToken();
  const now = (d.now ?? Date.now)();
  await d.store.sessionCreate({ tokenHash: tokenHash(token), userId, device: device.slice(0, 80), now });
  await d.store.activityTouch(userId, dayOf(now));
  return token;
}

const codeHash = (userId: string, kind: CodeKind, code: string): string => tokenHash(`${userId}:${kind}:${code}`);

const CODE_MAIL: Record<CodeKind, { subject: string; lead: string }> = {
  verify: { subject: 'Подтверждение почты', lead: 'Код для подтверждения почты в PIXEL PLANNER' },
  reset: { subject: 'Восстановление пароля', lead: 'Код для восстановления пароля в PIXEL PLANNER' },
};

/**
 * Выдать код и отправить письмо. Письмо уходит в фоне: иначе по времени ответа было бы видно, есть ли такая почта.
 * false — прошлый код отправлен только что.
 */
async function issueCode(d: Deps, user: { id: string; email: string }, kind: CodeKind, now: number): Promise<boolean> {
  const send = d.sendMail;
  if (!send) throw bad(503, 'mail_unavailable');
  // У аккаунта из Telegram почты нет: служебный адрес никуда не ведёт
  if (isTelegramOnly(user.email)) return true;
  const old = await d.store.codeGet(user.id, kind);
  if (old && now - old.sentAt < CODE_RESEND_MS) return false;
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await d.store.codeSet({ userId: user.id, kind, codeHash: codeHash(user.id, kind, code), expiresAt: now + CODE_TTL_MS, sentAt: now, attempts: 0 });
  const { subject, lead } = CODE_MAIL[kind];
  send(user.email, subject, `${lead}: ${code}\n\nКод действует 15 минут. Если это были не вы, просто не отвечайте на письмо.`).catch((e: unknown) => {
    console.warn('письмо не отправлено', e);
  });
  return true;
}

/** Верный ли код; после нескольких ошибок он сгорает. Погашает код вызывающий, когда дело сделано. */
async function checkCode(d: Deps, userId: string, kind: CodeKind, code: unknown, now: number): Promise<boolean> {
  const row = await d.store.codeGet(userId, kind);
  if (!row || now > row.expiresAt || typeof code !== 'string') return false;
  if (row.codeHash === codeHash(userId, kind, code.trim())) return true;
  if (row.attempts + 1 >= CODE_MAX_ATTEMPTS) await d.store.codeDelete(userId, kind);
  else await d.store.codeAttempt(userId, kind);
  return false;
}

async function telegramDevices(d: Deps, userId: string): Promise<string[]> {
  const out: string[] = [];
  for (const id of await d.store.devicesOfUser(userId)) if ((await d.store.deviceGet(id))?.endpoint.startsWith(TG_ENDPOINT)) out.push(id);
  return out;
}

async function setTelegramReminders(d: Deps, user: { id: string; telegramId?: string | null }, on: boolean, now: number): Promise<void> {
  const existing = await telegramDevices(d, user.id);
  if (!on || !user.telegramId) {
    for (const id of existing) await d.store.deviceDelete(id);
    return;
  }
  if (existing.length === 0) await d.store.deviceUpsert({ id: randomUUID(), userId: user.id, endpoint: `${TG_ENDPOINT}${user.telegramId}`, p256dh: '-', auth: '-', now });
}

/** Отзыв уходит админам: в Telegram, если он привязан, иначе на почту. */
async function handleFeedback(req: HttpReq, d: Deps, now: number): Promise<HttpRes> {
  const { userId } = await requireUser(req, d);
  const b = readJson(req.body) as { text?: unknown; version?: unknown };
  const text = typeof b.text === 'string' ? b.text.trim() : '';
  if (!text || text.length > FEEDBACK_MAX_LENGTH) throw bad(400, 'bad_text');
  const limiter = d.limiter ?? defaultLimiter;
  if (limiter.count(`feedback:${userId}`, FEEDBACK_WINDOW_MS, now) >= FEEDBACK_MAX) throw bad(429, 'too_many_attempts');
  const user = await d.store.userById(userId);
  if (!user) throw bad(401, 'unauthorized');
  const version = typeof b.version === 'string' && VERSION_RE.test(b.version) ? b.version : '?';
  const message = `Отзыв из PIXEL PLANNER\nОт: ${user.email}\nВерсия: ${version}\n\n${text}`;
  let delivered = false;
  for (const email of adminEmails(d.env)) {
    const admin = await d.store.userByEmail(email);
    try {
      if (admin?.telegramId && d.telegram) await d.telegram.send(Number(admin.telegramId), message);
      else if (d.sendMail) await d.sendMail(email, 'Отзыв из PIXEL PLANNER', message);
      else continue;
      delivered = true;
    } catch (e) {
      console.warn('отзыв не доставлен', e);
    }
  }
  if (!delivered) throw bad(503, 'feedback_unavailable');
  limiter.add(`feedback:${userId}`, now);
  return json({ ok: true });
}

/** Пользователь Telegram из подписанных данных Mini App или отказ. */
function webAppUser(d: Deps, initData: unknown, now: number): { id: string } {
  const token = d.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw bad(503, 'telegram_unavailable');
  const tg = typeof initData === 'string' ? checkInitData(initData, token, now) : 'нет данных';
  if (typeof tg === 'string') {
    console.warn('вход из Mini App отклонён:', tg);
    throw bad(401, 'bad_init_data');
  }
  return tg;
}

/** Кто вошёл по заголовку Authorization, без ошибки, если никто. */
async function currentUserId(req: HttpReq, d: Deps, now: number): Promise<string | null> {
  const token = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1];
  if (!token || !TOKEN_RE.test(token)) return null;
  return d.store.sessionUser(tokenHash(token), now, SESSION_MAX_IDLE_MS);
}

/** Выдать код и ссылку на бота. */
async function issueTelegramCode(d: Deps, kind: 'login' | 'link', userId: string | null, now: number): Promise<HttpRes> {
  const name = d.env.TELEGRAM_BOT_NAME;
  if (!d.telegram || !name) throw bad(503, 'telegram_unavailable');
  const code = newToken();
  await d.store.tgCodeSet({ codeHash: tokenHash(code), kind, userId, status: 'pending', expiresAt: now + TG_CODE_TTL_MS });
  return json({ code, url: `https://t.me/${name}?start=${kind}_${code}` });
}

/** Сообщение боту. Подтверждение всегда отдельной кнопкой: иначе чужая ссылка входила бы в аккаунт одним нажатием Start. */
async function handleBotText(d: Deps, tg: TelegramApi, e: Extract<BotEvent, { kind: 'text' }>, now: number): Promise<void> {
  const match = /^\/start (login|link)_([A-Za-z0-9_-]{43})$/.exec(e.text.trim());
  if (!match) {
    await tg.send(e.chatId, 'Привет! Это бот PIXEL PLANNER: задачи, привычки, тренировки, питание и финансы. Откройте приложение прямо здесь.', { text: 'Открыть приложение', webApp: d.env.APP_URL ?? DEFAULT_APP_URL });
    return;
  }
  const [, kind, code = ''] = match;
  const hash = tokenHash(code);
  const row = await d.store.tgCodeGet(hash);
  if (!row || row.kind !== kind || row.status !== 'pending' || now > row.expiresAt) {
    await tg.send(e.chatId, 'Ссылка устарела. Вернитесь в приложение и попробуйте ещё раз.');
    return;
  }
  const owner = await d.store.userByTelegram(e.telegramId);
  if (row.kind === 'login') {
    if (!owner) {
      await d.store.tgCodeSet({ ...row, status: 'unlinked' });
      await tg.send(e.chatId, 'Этот Telegram пока не привязан к аккаунту. Войдите по почте и привяжите его в личном кабинете.');
      return;
    }
    await tg.send(e.chatId, `Войти в PIXEL PLANNER как ${owner.email}? Нажимайте, только если сами запросили вход.`, { text: 'Войти', data: `ok:${code}` });
    return;
  }
  if (owner) {
    await tg.send(e.chatId, `Этот Telegram уже привязан к ${owner.email}.`);
    return;
  }
  const user = row.userId ? await d.store.userById(row.userId) : null;
  if (user) await tg.send(e.chatId, `Привязать этот Telegram к аккаунту ${user.email}?`, { text: 'Привязать', data: `ok:${code}` });
}

async function handleBotButton(d: Deps, tg: TelegramApi, e: Extract<BotEvent, { kind: 'button' }>, now: number): Promise<void> {
  await tg.answer(e.callbackId);
  const hash = tokenHash(e.data.replace(/^ok:/, ''));
  const row = await d.store.tgCodeGet(hash);
  if (!row || row.status !== 'pending' || now > row.expiresAt) {
    await tg.send(e.chatId, 'Ссылка устарела. Вернитесь в приложение и попробуйте ещё раз.');
    return;
  }
  const owner = await d.store.userByTelegram(e.telegramId);
  if (row.kind === 'login') {
    if (!owner) return;
    await d.store.tgCodeSet({ ...row, status: 'confirmed', userId: owner.id });
    await tg.send(e.chatId, 'Готово, вернитесь в приложение.');
    return;
  }
  const target = row.userId ? await d.store.userById(row.userId) : null;
  // Уже привязанный аккаунт не перепривязываем: иначе напоминания остались бы на прежнем Telegram
  if (owner || !target || target.telegramId) return;
  await d.store.userSetTelegram(target.id, e.telegramId);
  await d.store.tgCodeSet({ ...row, status: 'confirmed' });
  await tg.send(e.chatId, 'Telegram привязан. Теперь можно входить через него.');
}

/** Обновление от посредника. Отвечаем 200 и при ошибке, иначе Telegram будет повторять его снова и снова. */
async function handleTelegramUpdate(req: HttpReq, d: Deps, now: number): Promise<HttpRes> {
  const key = d.env.TELEGRAM_RELAY_KEY;
  if (!key || !safeEqual(req.headers['x-relay-key'] ?? '', key)) throw bad(403, 'forbidden');
  const event = parseUpdate(readJson(req.body));
  if (event && d.telegram) {
    const tg = d.telegram;
    await (event.kind === 'text' ? handleBotText(d, tg, event, now) : handleBotButton(d, tg, event, now)).catch((e: unknown) => {
      console.warn('бот не ответил', e);
    });
  }
  return json({ ok: true });
}

async function handleAuth(req: HttpReq, d: Deps, parts: string[]): Promise<HttpRes> {
  const action = parts[1];
  const now = (d.now ?? Date.now)();
  const limiter = d.limiter ?? defaultLimiter;
  const ip = req.ip ?? 'unknown';

  // POST /api/auth/register {email, password}
  if (action === 'register' && req.method === 'POST') {
    const b = readJson(req.body) as { email?: unknown; password?: unknown; device?: unknown };
    const email = typeof b.email === 'string' ? normalizeEmail(b.email) : '';
    const password = typeof b.password === 'string' ? b.password : '';
    if (limiter.count(`reg:${ip}`, REGISTER_WINDOW_MS, now) >= REGISTER_MAX_PER_IP) throw bad(429, 'too_many_attempts');
    // Служебные адреса аккаунтов из Telegram занимать нельзя: владелец того Telegram не смог бы начать
    if (!isValidEmail(email) || isTelegramOnly(email)) throw bad(400, 'invalid_email');
    if (!isValidPassword(password)) throw bad(400, 'weak_password');
    limiter.add(`reg:${ip}`, now);
    const id = randomUUID();
    if (!(await d.store.userCreate({ id, email, passHash: await hashPassword(password), now }))) throw bad(409, 'email_taken');
    const token = await openSession(d, id, typeof b.device === 'string' ? b.device : '');
    if (d.sendMail) await issueCode(d, { id, email }, 'verify', now);
    return json({ token, user: publicUser({ id, email }, d.env) }, 201);
  }

  // POST /api/auth/login {email, password}
  if (action === 'login' && req.method === 'POST') {
    const b = readJson(req.body) as { email?: unknown; password?: unknown; device?: unknown };
    const email = typeof b.email === 'string' ? normalizeEmail(b.email).slice(0, EMAIL_MAX) : '';
    const password = typeof b.password === 'string' ? b.password.slice(0, PASSWORD_MAX) : '';
    const keyEmail = `login:e:${email}`;
    const keyIp = `login:i:${ip}`;
    if (limiter.count(keyEmail, LOGIN_WINDOW_MS, now) >= LOGIN_MAX_PER_EMAIL || limiter.count(keyIp, LOGIN_WINDOW_MS, now) >= LOGIN_MAX_PER_IP) {
      throw bad(429, 'too_many_attempts');
    }
    const user = await d.store.userByEmail(email);
    // Пароль проверяем и когда почты нет (по заготовленному хешу), чтобы по времени ответа нельзя было узнать, есть ли такая почта
    const ok = user ? await verifyPassword(password, user.passHash) : (await verifyPassword(password, await dummyHash), false);
    if (!user || !ok) {
      limiter.add(keyEmail, now);
      limiter.add(keyIp, now);
      throw bad(401, 'bad_credentials');
    }
    limiter.reset(keyEmail);
    const token = await openSession(d, user.id, typeof b.device === 'string' ? b.device : '');
    return json({ token, user: publicUser(user, d.env) });
  }

  // POST /api/auth/telegram/start: ссылка на бота для входа
  if (action === 'telegram' && parts[2] === 'start' && req.method === 'POST') {
    if (limiter.count(`tg:${ip}`, RESET_WINDOW_MS, now) >= TG_START_MAX_PER_IP) throw bad(429, 'too_many_attempts');
    limiter.add(`tg:${ip}`, now);
    return issueTelegramCode(d, 'login', null, now);
  }

  // POST /api/auth/telegram/webapp {initData, device, create}: вход из Mini App.
  // Незнакомый Telegram: без create отвечаем unlinked (приложение предложит начать или войти по почте), с create создаём аккаунт.
  // Если приложение уже вошло в аккаунт этого Telegram, отвечаем same и новую сессию не заводим.
  if (action === 'telegram' && parts[2] === 'webapp' && req.method === 'POST') {
    const b = readJson(req.body) as { initData?: unknown; device?: unknown; create?: unknown };
    const tg = webAppUser(d, b.initData, now);
    let user = await d.store.userByTelegram(tg.id);
    if (user) {
      const current = await currentUserId(req, d, now);
      if (current === user.id) return json({ status: 'same' });
    } else {
      if (b.create !== true) return json({ status: 'unlinked' });
      if (limiter.count(`reg:${ip}`, REGISTER_WINDOW_MS, now) >= REGISTER_MAX_PER_IP) throw bad(429, 'too_many_attempts');
      limiter.add(`reg:${ip}`, now);
      const id = randomUUID();
      if (!(await d.store.userCreate({ id, email: telegramEmail(tg.id), passHash: '', now }))) throw bad(409, 'email_taken');
      await d.store.userSetTelegram(id, tg.id);
      // В Telegram нет push-уведомлений приложения, поэтому напоминания сразу идут через бота
      await setTelegramReminders(d, { id, telegramId: tg.id }, true, now);
      user = await d.store.userById(id);
      if (!user) throw bad(500, 'internal');
    }
    const session = await openSession(d, user.id, typeof b.device === 'string' ? b.device : 'Telegram');
    return json({ status: 'session', token: session, user: { ...publicUser(user, d.env), telegramReminders: (await telegramDevices(d, user.id)).length > 0 } });
  }

  // POST /api/auth/telegram/check {code, device}: приложение спрашивает, подтвердили ли вход
  if (action === 'telegram' && parts[2] === 'check' && req.method === 'POST') {
    const b = readJson(req.body) as { code?: unknown; device?: unknown };
    if (typeof b.code !== 'string' || !TOKEN_RE.test(b.code)) throw bad(400, 'bad_code');
    const hash = tokenHash(b.code);
    const row = await d.store.tgCodeGet(hash);
    if (!row || now > row.expiresAt) throw bad(400, 'bad_code');
    if (row.status === 'pending') return json({ status: 'pending' });
    await d.store.tgCodeDelete(hash);
    if (row.status === 'unlinked') throw bad(404, 'telegram_not_linked');
    const user = row.userId ? await d.store.userById(row.userId) : null;
    if (!user) throw bad(400, 'bad_code');
    // Привязка уже сделана вошедшим пользователем, новая сессия ему не нужна
    if (row.kind === 'link') return json({ status: 'linked', user: publicUser(user, d.env) });
    const token = await openSession(d, user.id, typeof b.device === 'string' ? b.device : '');
    return json({ status: 'confirmed', token, user: publicUser(user, d.env) });
  }

  // POST /api/auth/reset/request {email}: ответ одинаковый, есть такая почта или нет
  if (action === 'reset' && parts[2] === 'request' && req.method === 'POST') {
    if (!d.sendMail) throw bad(503, 'mail_unavailable');
    const b = readJson(req.body) as { email?: unknown };
    const email = typeof b.email === 'string' ? normalizeEmail(b.email).slice(0, EMAIL_MAX) : '';
    if (limiter.count(`reset:${ip}`, RESET_WINDOW_MS, now) >= RESET_MAX_PER_IP) throw bad(429, 'too_many_attempts');
    limiter.add(`reset:${ip}`, now);
    // Лишние запросы по одной почте молча не выполняем: ответ тот же, а писем владельцу больше не уйдёт
    const quiet = limiter.count(`reset:req:${email}`, RESET_WINDOW_MS, now) >= RESET_MAX_REQUESTS_PER_EMAIL;
    limiter.add(`reset:req:${email}`, now);
    const user = quiet ? null : await d.store.userByEmail(email);
    if (user) await issueCode(d, user, 'reset', now);
    return json({ ok: true });
  }

  // POST /api/auth/reset {email, code, newPassword}: заодно подтверждает почту и закрывает все сессии
  if (action === 'reset' && parts.length === 2 && req.method === 'POST') {
    const b = readJson(req.body) as { email?: unknown; code?: unknown; newPassword?: unknown };
    if (limiter.count(`reset:${ip}`, RESET_WINDOW_MS, now) >= RESET_MAX_PER_IP) throw bad(429, 'too_many_attempts');
    limiter.add(`reset:${ip}`, now);
    if (typeof b.newPassword !== 'string' || !isValidPassword(b.newPassword)) throw bad(400, 'weak_password');
    const email = typeof b.email === 'string' ? normalizeEmail(b.email).slice(0, EMAIL_MAX) : '';
    const failKey = `reset:fail:${email}`;
    if (limiter.count(failKey, RESET_WINDOW_MS, now) >= RESET_MAX_FAILS_PER_EMAIL) throw bad(429, 'too_many_attempts');
    const user = await d.store.userByEmail(email);
    if (!user || !(await checkCode(d, user.id, 'reset', b.code, now))) {
      limiter.add(failKey, now);
      throw bad(400, 'bad_code');
    }
    limiter.reset(failKey);
    await d.store.userSetPassword(user.id, await hashPassword(b.newPassword));
    await d.store.userSetVerified(user.id, now);
    await d.store.codeDelete(user.id, 'reset');
    await d.store.sessionsDeleteAll(user.id);
    return json({ ok: true });
  }

  // Остальное — только для вошедшего пользователя
  const { userId, token } = await requireUser(req, d);

  // GET /api/auth/me
  if (action === 'me' && req.method === 'GET') {
    const user = await d.store.userById(userId);
    if (!user) throw bad(401, 'unauthorized');
    const version = req.query.v ?? '';
    if (VERSION_RE.test(version)) await d.store.sessionSetVersion(tokenHash(token), version);
    return json({ user: { ...publicUser(user, d.env), telegramReminders: (await telegramDevices(d, userId)).length > 0 } });
  }

  // POST /api/auth/verify/send: отправить код ещё раз
  if (action === 'verify' && parts[2] === 'send' && req.method === 'POST') {
    const user = await d.store.userById(userId);
    if (!user) throw bad(401, 'unauthorized');
    if (!user.emailVerified && !(await issueCode(d, user, 'verify', now))) throw bad(429, 'code_cooldown');
    return json({ ok: true });
  }

  // POST /api/auth/verify {code}
  if (action === 'verify' && parts.length === 2 && req.method === 'POST') {
    const b = readJson(req.body) as { code?: unknown };
    if (!(await checkCode(d, userId, 'verify', b.code, now))) throw bad(400, 'bad_code');
    await d.store.userSetVerified(userId, now);
    await d.store.codeDelete(userId, 'verify');
    return json({ ok: true });
  }

  // POST /api/auth/telegram/webapp-link {initData}: вошли по почте внутри Mini App — привязываем этот Telegram
  if (action === 'telegram' && parts[2] === 'webapp-link' && req.method === 'POST') {
    const b = readJson(req.body) as { initData?: unknown };
    const tg = webAppUser(d, b.initData, now);
    const user = await d.store.userById(userId);
    if (!user) throw bad(401, 'unauthorized');
    if (user.telegramId && user.telegramId !== tg.id) throw bad(409, 'telegram_other');
    const owner = await d.store.userByTelegram(tg.id);
    if (owner && owner.id !== userId) throw bad(409, 'telegram_taken');
    if (!user.telegramId) await d.store.userSetTelegram(userId, tg.id);
    const fresh = await d.store.userById(userId);
    return json({ user: publicUser(fresh ?? user, d.env) });
  }

  // POST /api/auth/telegram/link: ссылка на бота для привязки
  if (action === 'telegram' && parts[2] === 'link' && req.method === 'POST') {
    if ((await d.store.userById(userId))?.telegramId) throw bad(409, 'telegram_linked');
    return issueTelegramCode(d, 'link', userId, now);
  }

  // POST /api/auth/telegram/reminders {on}: дублировать напоминания в Telegram
  if (action === 'telegram' && parts[2] === 'reminders' && req.method === 'POST') {
    const b = readJson(req.body) as { on?: unknown };
    const user = await d.store.userById(userId);
    if (!user) throw bad(401, 'unauthorized');
    if (b.on === true && !user.telegramId) throw bad(400, 'telegram_not_linked');
    await setTelegramReminders(d, user, b.on === true, now);
    return json({ ok: true });
  }

  // POST /api/auth/email {email, password}: аккаунт из Telegram получает почту и пароль
  if (action === 'email' && req.method === 'POST') {
    const b = readJson(req.body) as { email?: unknown; password?: unknown };
    const user = await d.store.userById(userId);
    if (!user) throw bad(401, 'unauthorized');
    if (!isTelegramOnly(user.email)) throw bad(400, 'has_email');
    const email = typeof b.email === 'string' ? normalizeEmail(b.email) : '';
    if (!isValidEmail(email) || isTelegramOnly(email)) throw bad(400, 'invalid_email');
    if (typeof b.password !== 'string' || !isValidPassword(b.password)) throw bad(400, 'weak_password');
    if (!(await d.store.userSetEmail(userId, email, await hashPassword(b.password)))) throw bad(409, 'email_taken');
    if (d.sendMail) await issueCode(d, { id: userId, email }, 'verify', now);
    const fresh = await d.store.userById(userId);
    return json({ user: publicUser(fresh ?? user, d.env) });
  }

  // DELETE /api/auth/telegram: отвязать
  if (action === 'telegram' && parts.length === 2 && req.method === 'DELETE') {
    const owner = await d.store.userById(userId);
    // Без Telegram в такой аккаунт будет не войти
    if (owner && isTelegramOnly(owner.email)) throw bad(400, 'telegram_only');
    await setTelegramReminders(d, { id: userId }, false, now);
    await d.store.userSetTelegram(userId, null);
    return json({ ok: true });
  }

  // POST /api/auth/logout
  if (action === 'logout' && req.method === 'POST') {
    await d.store.sessionDelete(tokenHash(token));
    return json({ ok: true });
  }

  // POST /api/auth/password {oldPassword, newPassword}: заодно выходит со всех остальных устройств
  if (action === 'password' && req.method === 'POST') {
    const b = readJson(req.body) as { oldPassword?: unknown; newPassword?: unknown };
    const user = await d.store.userById(userId);
    if (!user) throw bad(401, 'unauthorized');
    if (typeof b.oldPassword !== 'string' || !(await verifyPassword(b.oldPassword.slice(0, PASSWORD_MAX), user.passHash))) throw bad(401, 'bad_credentials');
    if (typeof b.newPassword !== 'string' || !isValidPassword(b.newPassword)) throw bad(400, 'weak_password');
    await d.store.userSetPassword(userId, await hashPassword(b.newPassword));
    await d.store.sessionsDeleteOthers(userId, tokenHash(token));
    return json({ ok: true });
  }

  // DELETE /api/auth/account {password}: стирает аккаунт и все данные
  if (action === 'account' && req.method === 'DELETE') {
    const b = readJson(req.body) as { password?: unknown; confirm?: unknown };
    const user = await d.store.userById(userId);
    if (!user) throw bad(401, 'unauthorized');
    // У аккаунта из Telegram пароля нет: достаточно явного подтверждения
    const allowed = isTelegramOnly(user.email) && !user.passHash ? b.confirm === true : typeof b.password === 'string' && (await verifyPassword(b.password.slice(0, PASSWORD_MAX), user.passHash));
    if (!allowed) throw bad(401, 'bad_credentials');
    await d.store.userDelete(userId);
    return json({ ok: true });
  }

  throw bad(404, 'not found');
}

/** Заменить расписание на всех устройствах пользователя; возвращает число принятых напоминаний. */
async function replaceUserSchedule(d: Deps, userId: string, raw: unknown[] | undefined, now: number): Promise<number> {
  if (!Array.isArray(raw)) throw new HttpError(400, 'items required');
  const items = raw.slice(0, MAX_ITEMS).map(parseItem).filter((x): x is ScheduleItem => x !== null);
  for (const deviceId of await d.store.devicesOfUser(userId)) await d.store.scheduleReplace(deviceId, items, now);
  return items.length;
}

async function handleApi(req: HttpReq, d: Deps): Promise<HttpRes> {
  const parts = req.path.split('/').filter(Boolean);
  const now = (d.now ?? Date.now)();

  if (req.method === 'GET' && parts[0] === 'config') {
    return json({ vapidPublicKey: d.env.VAPID_PUBLIC_KEY, push: Boolean(d.env.VAPID_PUBLIC_KEY && d.env.VAPID_PRIVATE_KEY) });
  }
  if (req.method === 'GET' && parts[0] === 'food' && parts[1] === 'search' && parts.length === 2) return handleFoodSearch(req, d, now);
  if (parts[0] === 'auth') return handleAuth(req, d, parts);
  if (req.method === 'POST' && parts[0] === 'feedback' && parts.length === 1) return handleFeedback(req, d, now);
  if (req.method === 'POST' && parts[0] === 'telegram' && parts[1] === 'update' && parts.length === 2) return handleTelegramUpdate(req, d, now);
  if (req.method === 'GET' && parts[0] === 'admin' && parts[1] === 'stats' && parts.length === 2) return handleAdmin(req, d, now);
  if (parts[0] === 'sync' && parts.length === 1) return handleSync(req, d);
  // Расписание напоминаний аккаунта: его присылает любое устройство, где открыто приложение, а получают все устройства аккаунта
  if (parts[0] === 'schedule' && parts.length === 1 && req.method === 'PUT') {
    const { userId } = await requireUser(req, d);
    const b = readJson(req.body) as { items?: unknown[]; deviceId?: unknown };
    const known = typeof b.deviceId === 'string' && UUID.test(b.deviceId) ? (await d.store.deviceOwner(b.deviceId)) === userId : null;
    return json({ ok: true, count: await replaceUserSchedule(d, userId, b.items, now), known });
  }

  if (parts[0] !== 'devices') throw new HttpError(404, 'not found');
  const { userId } = await requireUser(req, d);
  const id = parts[1];
  if (!id || !UUID.test(id)) throw new HttpError(400, 'bad device id');
  // Устройство чужого пользователя не видно и не меняется
  const owner = await d.store.deviceOwner(id);
  if (owner !== null && owner !== userId) throw new HttpError(404, 'unknown device');

  if (parts.length === 2 && req.method === 'PUT') {
    const b = readJson(req.body) as { subscription?: PushSubscription };
    const sub = b.subscription;
    const endpoint = str(sub?.endpoint, 1000);
    const p256dh = str(sub?.keys.p256dh, 200);
    const auth = str(sub?.keys.auth, 100);
    if (!endpoint || !isPushEndpoint(endpoint) || !p256dh || !auth) throw new HttpError(400, 'bad subscription');
    await d.store.deviceUpsert({ id, userId, endpoint, p256dh, auth, now });
    return json({ ok: true });
  }
  if (parts.length === 2 && req.method === 'DELETE') {
    await d.store.deviceDelete(id);
    return json({ ok: true });
  }

  if (owner === null) throw new HttpError(404, 'unknown device');

  if (parts[2] === 'schedule' && req.method === 'PUT') {
    const b = readJson(req.body) as { items?: unknown[] };
    return json({ ok: true, count: await replaceUserSchedule(d, userId, b.items, now) });
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
    if (e instanceof HttpError) return { ...json({ error: e.message }, e.status), headers: { ...SAFE_HEADERS, ...cors } };
    console.error(e);
    return { ...json({ error: 'internal' }, 500), headers: { ...SAFE_HEADERS, ...cors } };
  }
}

/** Рассылка наступивших напоминаний (запускается таймером каждые несколько секунд). */
export async function sendDue(d: Deps): Promise<number> {
  const now = (d.now ?? Date.now)();
  const push = d.send ?? sendOne;
  const tg = d.telegram;
  const send: typeof push = async (env, to, data) => {
    if (!to.endpoint.startsWith(TG_ENDPOINT)) return push(env, to, data);
    if (!tg) {
      console.warn('напоминание в Telegram не отправлено: бот не настроен');
      return { status: 503, detail: 'telegram off' };
    }
    const { title, body } = data as { title: string; body: string };
    await tg.send(Number(to.endpoint.slice(TG_ENDPOINT.length)), `⏰ ${title}${body ? `\n${body}` : ''}`);
    return { status: 200, detail: '' };
  };
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
        if (status === 404 || status === 410) {
          // Почему телефон перестал получать уведомления, видно только здесь
          console.warn('устройство забыто: подписка недействительна', r.deviceId.slice(0, 8), status);
          gone.add(r.deviceId);
        }
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
