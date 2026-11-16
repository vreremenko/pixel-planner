/*
 * MCP-сервер PIXEL PLANNER: даёт нейросети (Claude Code, Claude Desktop, Cursor, Gemini CLI и другим клиентам MCP)
 * читать и добавлять записи в приложение от имени владельца ключа. Работает на компьютере пользователя через stdio.
 *
 *   PP_API_KEY=ppk_… node mcp/dist/pixel-planner-mcp.mjs
 *
 * Сами действия описаны в src/assistant/tools.ts и не зависят от MCP: их же позже использует бот с нейронкой.
 * Изменения уходят на сервер как обычная синхронизация, телефон и компьютер подтягивают их сами.
 */
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { today } from '../src/core/domain/dates';
import { AccountData, type WireRecord } from '../src/assistant/data';
import { TOOLS, ToolError } from '../src/assistant/tools';

const KEY = process.env.PP_API_KEY ?? '';
const PRIMARY = process.env.PP_API_URL ?? 'https://92-63-103-91.sslip.io';
/** Через часть VPN сервер в России не открывается: тогда идём через посредника на Cloudflare, как и приложение. */
const FALLBACK = process.env.PP_API_FALLBACK ?? 'https://pp-tg-relay.pixel-planner.workers.dev';
const TIMEOUT_MS = 15_000;
const PUSH_CHUNK = 300;

/** Сначала короткая попытка: если адрес не открывается (VPN), быстрее перейти на другой, чем ждать полный срок. */
const FIRST_TRY_MS = 6_000;

let base = PRIMARY;

/** Короткое описание сетевой ошибки: по нему видно, где именно оборвалось. */
const why = (e: unknown): string => {
  if (!(e instanceof Error)) return String(e);
  const cause = (e as Error & { cause?: { code?: string; message?: string } }).cause;
  return e.name === 'TimeoutError' ? 'не ответил вовремя' : (cause?.code ?? cause?.message ?? e.message);
};

async function api(path: string, init: RequestInit = {}): Promise<unknown> {
  const call = (b: string, ms: number) =>
    fetch(`${b}/api/${path}`, {
      ...init,
      signal: AbortSignal.timeout(ms),
      headers: { authorization: `Bearer ${KEY}`, 'user-agent': 'PixelPlanner-MCP/1.0', ...(init.body ? { 'content-type': 'application/json' } : {}) },
    });
  const other = base === PRIMARY ? FALLBACK : PRIMARY;
  let res: Response;
  try {
    res = await call(base, FIRST_TRY_MS);
  } catch (first) {
    // Нет связи с текущим адресом — пробуем другой и запоминаем удачный
    try {
      res = await call(other, TIMEOUT_MS);
      base = other;
    } catch (second) {
      throw new ToolError(`Нет связи с сервером приложения. ${base}: ${why(first)}; ${other}: ${why(second)}`);
    }
  }
  if (res.status === 401) throw new ToolError('Ключ PP_API_KEY не подходит или отозван. Создайте новый в личном кабинете приложения.');
  if (!res.ok) throw new ToolError(`Сервер ответил ошибкой ${String(res.status)}`);
  return res.json();
}

async function pullAll(): Promise<WireRecord[]> {
  const out: WireRecord[] = [];
  let cursor = 0;
  for (;;) {
    const page = (await api(`sync?after=${String(cursor)}`)) as { records: WireRecord[]; cursor: number; more: boolean };
    out.push(...page.records);
    cursor = page.cursor;
    if (!page.more) return out;
  }
}

async function push(records: WireRecord[]): Promise<void> {
  for (let i = 0; i < records.length; i += PUSH_CHUNK) await api('sync', { method: 'PUT', body: JSON.stringify({ records: records.slice(i, i + PUSH_CHUNK) }) });
}

// Низкоуровневый Server нарочно: действия описаны обычным JSON Schema, общим для всех нейросетей, а не схемами zod
// eslint-disable-next-line @typescript-eslint/no-deprecated
const server = new Server(
  { name: 'pixel-planner', version: '1.0.0' },
  {
    capabilities: { tools: {} },
    instructions:
      'Ежедневник PIXEL PLANNER пользователя: задачи, привычки, финансы, питание. Начинайте с get_day, чтобы увидеть данные и id задач. ' +
      'Суммы в рублях, даты ГГГГ-ММ-ДД или today/tomorrow/yesterday. Отвечайте пользователю по-русски.',
  },
);

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: { title: t.title, readOnlyHint: t.readOnly, destructiveHint: false, openWorldHint: false } })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOLS.find((t) => t.name === req.params.name);
  const reply = (text: string, isError = false) => ({ content: [{ type: 'text' as const, text }], ...(isError ? { isError: true } : {}) });
  if (!tool) return reply(`Нет такого действия: ${req.params.name}`, true);
  if (!KEY.startsWith('ppk_')) return reply('Не задан ключ PP_API_KEY. Создайте его в личном кабинете приложения: «Ключи доступа».', true);
  try {
    const data = new AccountData(await pullAll());
    const text = tool.run(data, req.params.arguments ?? {}, { now: Date.now(), today: today(), newId: randomUUID });
    const changes = data.changes();
    if (changes.length > 0) await push(changes);
    return reply(text);
  } catch (e) {
    if (e instanceof ToolError) return reply(e.message, true);
    return reply(`Не получилось: ${e instanceof Error ? e.message : String(e)}`, true);
  }
});

await server.connect(new StdioServerTransport());
