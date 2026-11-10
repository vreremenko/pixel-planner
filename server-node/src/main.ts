/*
 * Точка входа обычного сервера: HTTP-API на node:http (за Caddy, который даёт HTTPS), хранилище SQLite
 * и рассылка push-напоминаний каждые несколько секунд. Настройки — переменные окружения (см. server-node/README.md).
 */
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname } from 'node:path';
import { handle, sendDue, type Env } from './core.ts';
import { createMailer } from './mail.ts';
import { SqliteStore } from './sqlite-store.ts';
import { createTelegram } from './telegram.ts';

const env: Env = {
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
  VAPID_SUBJECT: process.env.VAPID_SUBJECT,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  ADMIN_EMAILS: process.env.ADMIN_EMAILS,
  TELEGRAM_BOT_NAME: process.env.TELEGRAM_BOT_NAME,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_RELAY_KEY: process.env.TELEGRAM_RELAY_KEY,
  APP_URL: process.env.APP_URL,
};
const sendMail = createMailer(process.env);
const telegram = createTelegram(process.env);
const port = Number(process.env.PORT ?? 8787);
const dbPath = process.env.DB_PATH ?? './data/pixel-planner.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const store = new SqliteStore(dbPath);
/** Одни и те же зависимости для запросов и для рассылки напоминаний: раньше рассылка не знала про бота. */
const deps = { store, env, ...(sendMail ? { sendMail } : {}), ...(telegram ? { telegram } : {}) };

const MAX_BODY = 1_000_000;
/** Как часто проверять наступившие напоминания: отправка идёт почти в момент срока. */
const TICK_MS = 5_000;

/** Адрес клиента: за Caddy он приходит в X-Forwarded-For (последний адрес дописал сам Caddy). */
function clientIp(forwarded: string | string[] | undefined, remote: string | undefined): string {
  const f = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',').at(-1)?.trim();
  return f ?? remote ?? 'unknown';
}

const server = createServer((req, res) => {
  void (async () => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const i = url.pathname.indexOf('/api/');
      if (i < 0) {
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end('PIXEL PLANNER API');
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const c of req) {
        size += (c as Buffer).length;
        if (size > MAX_BODY) {
          res.writeHead(413).end();
          return;
        }
        chunks.push(c as Buffer);
      }
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers[k.toLowerCase()] = v;
      const out = await handle(
        { ip: clientIp(req.headers['x-forwarded-for'], req.socket.remoteAddress), method: req.method ?? 'GET', path: url.pathname.slice(i + 5).replace(/\/+$/, ''), query: Object.fromEntries(url.searchParams), headers, body: Buffer.concat(chunks).toString('utf8') },
        deps,
      );
      res.writeHead(out.status, out.headers).end(out.status === 204 ? undefined : out.body);
    } catch (e) {
      console.error(e);
      res.writeHead(500, { 'content-type': 'application/json' }).end('{"error":"internal"}');
    }
  })();
});

server.listen(port, '127.0.0.1', () => { console.log(`PIXEL PLANNER API: http://127.0.0.1:${String(port)}/api/`); });

let ticking = false;
setInterval(() => {
  if (ticking) return;
  ticking = true;
  sendDue(deps)
    .then((n) => {
      if (n > 0) console.log('push отправлено:', n);
    })
    .catch((e: unknown) => { console.error('рассылка не удалась', e); })
    .finally(() => {
      ticking = false;
    });
}, TICK_MS);

const stop = () => {
  server.close();
  store.close();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
