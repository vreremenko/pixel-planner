/*
 * MCP в интернете: нейросети (ChatGPT, claude.ai, приложения Claude, Cursor…) подключаются по адресу /api/mcp
 * и входят через OAuth 2.1: регистрируются сами (RFC 7591), человек разрешает доступ в приложении,
 * нейросеть получает ключ доступа и ключ продления. Ключ доступа — обычный личный ключ (ppk_…): он виден
 * в «Ключах доступа» и отзывается там же. Действия те же, что у локального MCP (src/assistant).
 */
import { createHash, randomUUID } from 'node:crypto';
import { newToken, tokenHash, type RateLimiter } from './auth.ts';
import { HttpError, SAFE_HEADERS, json, readJson } from './http.ts';
import type { HttpReq, HttpRes, Store } from './types.ts';
import { DEFAULT_TZ, isTimeZone, loadAccount, refreshSchedule, todayIn } from './schedule.ts';
import { mcpMessage } from '../../src/assistant/mcp.ts';

export interface RemoteDeps {
  store: Store;
  limiter: RateLimiter;
  now: number;
  /** Адрес приложения: там человек разрешает доступ. */
  appUrl: string;
  /** Пользователь по сессии приложения (не по ключу). */
  sessionUser: (req: HttpReq) => Promise<string>;
  /** Пользователь по ключу доступа или сессии. */
  keyUser: (req: HttpReq) => Promise<string>;
  /** Бросает ошибку, если почта аккаунта не подтверждена (и это не аккаунт из Telegram). */
  trusted: (userId: string) => Promise<void>;
  /** Проверить, что записи влезают в объём аккаунта. */
  checkQuota: (userId: string, adding: number) => Promise<void>;
}

const ACCESS_PREFIX = 'ppk_';
const REFRESH_PREFIX = 'ppr_';
const ACCESS_TTL_MS = 30 * 86_400_000;
const CODE_TTL_MS = 5 * 60_000;
const REQUEST_TTL_MS = 15 * 60_000;
const MAX_GRANTS = 20;
const REGISTER_WINDOW_MS = 3_600_000;
const REGISTER_MAX_PER_IP = 20;
const TOKEN_WINDOW_MS = 10 * 60_000;
const TOKEN_MAX_PER_IP = 60;

/** Эти адреса открыты всем сайтам: доступ даёт только ключ в заголовке, а не куки браузера. */
export const PUBLIC_CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id',
  'access-control-expose-headers': 'www-authenticate, mcp-session-id',
  'access-control-max-age': '86400',
};

export const isPublicPath = (path: string): boolean => path === 'mcp' || path.startsWith('oauth/') || path.startsWith('.well-known/');

interface Client {
  name: string;
  redirectUris: string[];
}

interface Pending {
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string | null;
  scope: string | null;
}

interface Code extends Pending {
  userId: string;
}

const HOST_RE = /^[a-z0-9.-]+(:\d{1,5})?$/i;

/** Внешний адрес сервера: по нему нейросеть находит описание входа. */
function baseUrl(req: HttpReq): string {
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? '';
  if (!HOST_RE.test(host)) throw new HttpError(400, 'bad host');
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  return `${local ? 'http' : 'https'}://${host}`;
}

const oauthError = (error: string, description: string, status = 400): HttpRes => json({ error, error_description: description }, status);

/** Адрес возврата: https, http только для своего компьютера, или схема приложения (cursor://…); без опасных схем и якоря. */
function validRedirect(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 500) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.hash) return null;
  const scheme = u.protocol.slice(0, -1).toLowerCase();
  if (scheme === 'https') return raw;
  if (scheme === 'http') return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) ? raw : null;
  if (['javascript', 'data', 'file', 'vbscript', 'blob', 'about', 'ftp', 'ws', 'wss'].includes(scheme)) return null;
  return /^[a-z][a-z0-9+.-]{1,40}$/.test(scheme) ? raw : null;
}

const withParams = (url: string, params: Record<string, string | null>): string => {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) if (v !== null) u.searchParams.set(k, v);
  return u.toString();
};

const s256 = (verifier: string): string => createHash('sha256').update(verifier).digest('base64url');

/** Тело запроса к /token: по стандарту это форма, но некоторые клиенты шлют JSON. */
function readForm(req: HttpReq): Record<string, string> {
  const type = req.headers['content-type'] ?? '';
  if (type.includes('application/json')) {
    const o = readJson(req.body) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(o).filter((e): e is [string, string] => typeof e[1] === 'string'));
  }
  if (req.body.length > 16_384) throw new HttpError(413, 'too large');
  return Object.fromEntries(new URLSearchParams(req.body));
}

async function getJson<T>(d: RemoteDeps, kind: string, id: string): Promise<T | null> {
  const raw = await d.store.oauthItemGet(kind, id, d.now);
  return raw ? (JSON.parse(raw) as T) : null;
}

/** Описания для нейросети: где ресурс и где входить. */
export function wellKnown(req: HttpReq, path: string, relayUrl?: string): HttpRes {
  const base = baseUrl(req);
  // Страницу входа открывает браузер человека, а через часть VPN наш сервер в России не открывается:
  // её адрес — через посредника на Cloudflare (он пересылает /api/* как есть). Ключи и действия нейросеть
  // получает со своих серверов напрямую.
  const browserBase = relayUrl && /^https:\/\/[a-z0-9.-]+\/?$/i.test(relayUrl) ? relayUrl.replace(/\/$/, '') : base;
  const doc = path.slice('.well-known/'.length);
  if (doc === 'oauth-protected-resource' || doc.startsWith('oauth-protected-resource/')) {
    return json({ resource: `${base}/api/mcp`, authorization_servers: [base], bearer_methods_supported: ['header'], resource_name: 'PIXEL PLANNER', scopes_supported: ['planner'] });
  }
  if (doc === 'oauth-authorization-server' || doc.startsWith('oauth-authorization-server/') || doc === 'openid-configuration') {
    return json({
      issuer: base,
      authorization_endpoint: `${browserBase}/api/oauth/authorize`,
      token_endpoint: `${base}/api/oauth/token`,
      registration_endpoint: `${base}/api/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['planner'],
      service_documentation: 'https://github.com/vreremenko/pixel-planner',
    });
  }
  throw new HttpError(404, 'not found');
}

/** /api/oauth/…: регистрация клиента, разрешение доступа и выдача ключей. */
export async function oauth(req: HttpReq, d: RemoteDeps, parts: string[]): Promise<HttpRes> {
  const action = parts[1];
  const ip = req.ip ?? 'unknown';

  // Нейросеть регистрирует себя сама: имя и адреса возврата
  if (action === 'register' && req.method === 'POST' && parts.length === 2) {
    if (d.limiter.count(`oauth-reg:${ip}`, REGISTER_WINDOW_MS, d.now) >= REGISTER_MAX_PER_IP) return oauthError('slow_down', 'Слишком много регистраций', 429);
    d.limiter.add(`oauth-reg:${ip}`, d.now);
    const b = readJson(req.body, 16_384) as { redirect_uris?: unknown; client_name?: unknown };
    const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.slice(0, 10).map(validRedirect) : [];
    if (uris.length === 0 || uris.some((u) => u === null)) return oauthError('invalid_redirect_uri', 'Нужны адреса возврата https');
    const name = typeof b.client_name === 'string' && b.client_name.trim() ? b.client_name.trim().slice(0, 60) : 'Нейросеть';
    const id = randomUUID();
    const client: Client = { name, redirectUris: uris as string[] };
    await d.store.oauthItemPut('client', id, JSON.stringify(client), 0, d.now);
    return json(
      {
        client_id: id,
        client_id_issued_at: Math.floor(d.now / 1000),
        client_name: name,
        redirect_uris: client.redirectUris,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      },
      201,
    );
  }

  // Начало входа: проверяем запрос и отправляем человека в приложение, где он разрешит доступ
  if (action === 'authorize' && req.method === 'GET' && parts.length === 2) {
    const q = req.query;
    const clientId = q.client_id ?? '';
    const client = clientId ? await getJson<Client>(d, 'client', clientId) : null;
    if (!client) return oauthError('invalid_client', 'Неизвестный клиент: подключите нейросеть заново');
    const redirectUri = q.redirect_uri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined);
    // На незарегистрированный адрес не возвращаем даже ошибку: так нельзя увести человека на чужой сайт
    if (!redirectUri || !client.redirectUris.includes(redirectUri)) return oauthError('invalid_request', 'Адрес возврата не совпадает с зарегистрированным');
    const state = q.state ?? null;
    const back = (error: string): HttpRes => ({ status: 302, headers: { location: withParams(redirectUri, { error, state }), 'cache-control': 'no-store' }, body: '' });
    if (q.response_type !== 'code') return back('unsupported_response_type');
    const challenge = q.code_challenge ?? '';
    if (q.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) return back('invalid_request');
    const id = newToken();
    const pending: Pending = { clientId, redirectUri, challenge, state, scope: q.scope ?? null };
    await d.store.oauthItemPut('request', id, JSON.stringify(pending), d.now + REQUEST_TTL_MS, d.now);
    return { status: 302, headers: { location: `${d.appUrl}#/connect?r=${id}`, 'cache-control': 'no-store' }, body: '' };
  }

  // Приложение спрашивает, кто просит доступ (только вошедший человек)
  if (action === 'request' && req.method === 'GET' && parts.length === 3 && parts[2]) {
    await d.sessionUser(req);
    const p = await getJson<Pending>(d, 'request', parts[2]);
    const client = p ? await getJson<Client>(d, 'client', p.clientId) : null;
    if (!p || !client) throw new HttpError(404, 'request_expired');
    const u = new URL(p.redirectUri);
    return json({ client: client.name, redirectHost: u.host || u.protocol.slice(0, -1) });
  }

  // Человек нажал «Разрешить» или «Отказать»: приложение получает адрес, куда вернуть его к нейросети
  if (action === 'approve' && req.method === 'POST' && parts.length === 2) {
    const userId = await d.sessionUser(req);
    const b = readJson(req.body) as { id?: unknown; allow?: unknown };
    // Доступ нейросети — только для подтверждённой почты (см. requireTrusted в core.ts)
    if (b.allow === true) await d.trusted(userId);
    const id = typeof b.id === 'string' ? b.id : '';
    const p = id ? await getJson<Pending>(d, 'request', id) : null;
    if (!p) throw new HttpError(404, 'request_expired');
    await d.store.oauthItemDelete('request', id);
    if (b.allow !== true) return json({ redirect: withParams(p.redirectUri, { error: 'access_denied', state: p.state }) });
    const code = newToken();
    const c: Code = { ...p, userId };
    await d.store.oauthItemPut('code', tokenHash(code), JSON.stringify(c), d.now + CODE_TTL_MS, d.now);
    return json({ redirect: withParams(p.redirectUri, { code, state: p.state, iss: baseUrl(req) }) });
  }

  // Обмен кода на ключи и продление ключей
  if (action === 'token' && req.method === 'POST' && parts.length === 2) {
    if (d.limiter.count(`oauth-token:${ip}`, TOKEN_WINDOW_MS, d.now) >= TOKEN_MAX_PER_IP) return oauthError('slow_down', 'Слишком много запросов', 429);
    d.limiter.add(`oauth-token:${ip}`, d.now);
    const f = readForm(req);
    if (f.grant_type === 'authorization_code') {
      const code = f.code ?? '';
      const c = code ? await getJson<Code>(d, 'code', tokenHash(code)) : null;
      // Код одноразовый: удаляем сразу, даже если дальше что-то не сойдётся
      if (code) await d.store.oauthItemDelete('code', tokenHash(code));
      if (!c) return oauthError('invalid_grant', 'Код недействителен или устарел');
      if ((f.client_id && f.client_id !== c.clientId) || (f.redirect_uri && f.redirect_uri !== c.redirectUri)) return oauthError('invalid_grant', 'Код выдан другому клиенту');
      if (!f.code_verifier || s256(f.code_verifier) !== c.challenge) return oauthError('invalid_grant', 'Не сходится проверка PKCE');
      const client = await getJson<Client>(d, 'client', c.clientId);
      const keys = await d.store.apiKeysOfUser(c.userId);
      if (keys.filter((k) => k.oauth).length >= MAX_GRANTS) return oauthError('access_denied', 'Слишком много подключённых нейросетей: отключите лишние в «Ключах доступа»');
      const access = `${ACCESS_PREFIX}${newToken()}`;
      const refresh = `${REFRESH_PREFIX}${newToken()}`;
      const name = client?.name ?? 'Нейросеть';
      await d.store.oauthGrantSave({ id: randomUUID(), userId: c.userId, name, clientId: c.clientId, keyHash: tokenHash(access), refreshHash: tokenHash(refresh), expiresAt: d.now + ACCESS_TTL_MS, now: d.now });
      return json({ access_token: access, token_type: 'Bearer', expires_in: Math.floor(ACCESS_TTL_MS / 1000), refresh_token: refresh, scope: c.scope ?? 'planner' });
    }
    if (f.grant_type === 'refresh_token') {
      const old = f.refresh_token ?? '';
      if (!old.startsWith(REFRESH_PREFIX)) return oauthError('invalid_grant', 'Ключ продления недействителен');
      const access = `${ACCESS_PREFIX}${newToken()}`;
      const refresh = `${REFRESH_PREFIX}${newToken()}`;
      const r = await d.store.oauthRefresh(tokenHash(old), { keyHash: tokenHash(access), refreshHash: tokenHash(refresh), expiresAt: d.now + ACCESS_TTL_MS }, d.now);
      // Чужой клиент с украденным ключом продления: ключи уже сменились, прежние больше не действуют
      if (!r || (f.client_id && f.client_id !== r.clientId)) return oauthError('invalid_grant', 'Ключ продления недействителен');
      return json({ access_token: access, token_type: 'Bearer', expires_in: Math.floor(ACCESS_TTL_MS / 1000), refresh_token: refresh, scope: 'planner' });
    }
    return oauthError('unsupported_grant_type', 'Поддерживаются authorization_code и refresh_token');
  }

  throw new HttpError(404, 'not found');
}


/** /api/mcp: JSON-RPC по HTTP (Streamable HTTP без потока событий). */
export async function mcp(req: HttpReq, d: RemoteDeps): Promise<HttpRes> {
  if (req.method !== 'POST') return { status: 405, headers: { ...SAFE_HEADERS, allow: 'POST' }, body: '' };
  let userId: string;
  try {
    userId = await d.keyUser(req);
  } catch (e) {
    if (e instanceof HttpError && (e.status === 401 || e.status === 403)) {
      // По этому заголовку нейросеть узнаёт, где входить
      const meta = `${baseUrl(req)}/.well-known/oauth-protected-resource/api/mcp`;
      return { ...json({ error: 'unauthorized' }, 401), headers: { ...SAFE_HEADERS, 'www-authenticate': `Bearer resource_metadata="${meta}", scope="planner"` } };
    }
    throw e;
  }
  let body: unknown;
  try {
    body = readJson(req.body);
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
  }

  // «Сегодня» — в поясе устройств пользователя (его присылает приложение вместе с расписанием)
  const savedTz = (await d.store.scheduleMetaGet(userId)).tz;
  const tz = isTimeZone(savedTz) ? savedTz : DEFAULT_TZ;
  const run = async (tool: Parameters<Parameters<typeof mcpMessage>[1]>[0], args: Record<string, unknown>): Promise<string> => {
    const data = await loadAccount(d.store, userId);
    const text = tool.run(data, args, { now: d.now, today: todayIn(d.now, tz), newId: randomUUID });
    const changes = data.changes();
    if (changes.length > 0) {
      await d.checkQuota(userId, changes.length);
      await d.store.syncPush(userId, changes);
      // Напоминания задач и платежей, добавленных нейросетью, должны прийти, даже если приложение сейчас не открыто
      try {
        await refreshSchedule(d.store, userId, d.now, data);
      } catch (e) {
        console.error('mcp: расписание не пересчитано', e);
      }
    }
    return text;
  };
  const one = async (m: unknown) => {
    try {
      return await mcpMessage(m, run);
    } catch (e) {
      console.error('mcp', e);
      const id = typeof m === 'object' && m !== null && 'id' in m ? (m).id : null;
      return { jsonrpc: '2.0', id: typeof id === 'string' || typeof id === 'number' ? id : null, error: { code: -32603, message: 'Внутренняя ошибка сервера' } };
    }
  };
  const out = Array.isArray(body) ? (await Promise.all(body.slice(0, 20).map(one))).filter((x) => x !== null) : await one(body);
  if (out === null || (Array.isArray(out) && out.length === 0)) return { status: 202, headers: { ...SAFE_HEADERS }, body: '' };
  return json(out);
}
