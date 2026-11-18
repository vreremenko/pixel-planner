/*
 * Протокол MCP (JSON-RPC) без привязки к способу связи: им отвечает сервер по адресу /api/mcp
 * (ChatGPT, claude.ai и другие нейросети в интернете). Сами действия — в tools.ts.
 */
import { TOOLS, ToolError, type Tool } from './tools';

export const MCP_SERVER_INFO = { name: 'pixel-planner', title: 'PIXEL PLANNER', version: '1.2.0' };

export const MCP_INSTRUCTIONS =
  'Ежедневник PIXEL PLANNER пользователя: задачи, привычки, финансы, питание, замеры тела. Начинайте с get_day, чтобы увидеть данные и id задач. ' +
  'Суммы в рублях, даты ГГГГ-ММ-ДД или today/tomorrow/yesterday. Удалять и менять записи только по прямой просьбе пользователя. ' +
  'Еда: сначала find_food по названию и марке. Если именно этого продукта нет — не берите похожий и не переспрашивайте: сами найдите КБЖУ на 100 г в интернете ' +
  '(сайт производителя или магазина) и передайте их в log_food вместе с маркой, коротко назвав источник. Уточняйте у пользователя, только если продукт правда не понять. ' +
  'Отвечайте по-русски.';

/** Версии протокола, которые мы понимаем; первая — самая новая. */
export const MCP_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'] as const;

/** Описание действия для tools/list. */
export const toolDescriptor = (t: Tool) => ({
  name: t.name,
  title: t.title,
  description: t.description,
  inputSchema: t.inputSchema,
  annotations: { title: t.title, readOnlyHint: t.readOnly, destructiveHint: t.destructive === true, openWorldHint: false },
});

/** Выполнить действие над данными аккаунта и вернуть текст ответа (ToolError — понятная ошибка для нейросети). */
export type ToolRunner = (tool: Tool, args: Record<string, unknown>) => Promise<string>;

type Id = string | number | null;
const ok = (id: Id, result: unknown) => ({ jsonrpc: '2.0' as const, id, result });
const fail = (id: Id, code: number, message: string) => ({ jsonrpc: '2.0' as const, id, error: { code, message } });

/** Ответ на одно сообщение JSON-RPC; null — это уведомление, отвечать не нужно. */
export async function mcpMessage(msg: unknown, run: ToolRunner): Promise<object | null> {
  if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) return fail(null, -32600, 'Invalid Request');
  const m = msg as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
  const id: Id = typeof m.id === 'string' || typeof m.id === 'number' ? m.id : null;
  // Ответы и уведомления клиента (notifications/initialized и прочие) ответа не ждут
  if (!('id' in m) || m.id === undefined) return null;
  if (m.jsonrpc !== '2.0' || typeof m.method !== 'string') return fail(id, -32600, 'Invalid Request');
  const params = (typeof m.params === 'object' && m.params !== null ? m.params : {}) as Record<string, unknown>;

  switch (m.method) {
    case 'initialize': {
      const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
      const protocolVersion = (MCP_VERSIONS as readonly string[]).includes(asked) ? asked : MCP_VERSIONS[0];
      return ok(id, { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: MCP_SERVER_INFO, instructions: MCP_INSTRUCTIONS });
    }
    case 'ping':
      return ok(id, {});
    case 'tools/list':
      return ok(id, { tools: TOOLS.map(toolDescriptor) });
    case 'tools/call': {
      const name = typeof params.name === 'string' ? params.name : '';
      const args = typeof params.arguments === 'object' && params.arguments !== null ? (params.arguments as Record<string, unknown>) : {};
      const tool = TOOLS.find((t) => t.name === name);
      const reply = (text: string, isError = false) => ok(id, { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) });
      if (!tool) return reply(`Нет такого действия: ${name}`, true);
      try {
        return reply(await run(tool, args));
      } catch (e) {
        if (e instanceof ToolError) return reply(e.message, true);
        throw e;
      }
    }
    case 'resources/list':
      return ok(id, { resources: [] });
    case 'prompts/list':
      return ok(id, { prompts: [] });
    default:
      return fail(id, -32601, `Method not found: ${m.method}`);
  }
}
