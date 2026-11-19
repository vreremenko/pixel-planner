/* Бот: привязка Telegram к аккаунту и вход. С этого сервера Telegram недоступен, поэтому запросы идут через посредника (relay/). */

export interface TelegramEnv {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_RELAY_URL?: string;
  TELEGRAM_RELAY_KEY?: string;
}

/** Кнопка под сообщением: ответ боту (data) или открытие приложения (webApp). */
export type Button = { text: string; data: string } | { text: string; webApp: string };

export interface TelegramApi {
  send(chatId: number, text: string, button?: Button): Promise<void>;
  answer(callbackId: string): Promise<void>;
  /** «Печатает…» в чате, пока готовится ответ (держится ~5 секунд). */
  typing?(chatId: number): Promise<void>;
  /** Скачать файл (голосовое сообщение) по его id. */
  download?(fileId: string): Promise<Uint8Array>;
}

const TIMEOUT_MS = 10_000;
/** Голосовые больше ~2 МБ (несколько минут) не скачиваем. */
const MAX_FILE = 2_000_000;

export function createTelegram(env: TelegramEnv): TelegramApi | undefined {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_RELAY_URL: relay, TELEGRAM_RELAY_KEY: key } = env;
  if (!token || !relay || !key) return undefined;
  const call = async (method: string, body: unknown): Promise<unknown> => {
    const res = await fetch(`${relay}/out/${key}/bot${token}/${method}`, {
      method: 'POST',
      // Без своего названия клиента Cloudflare может отклонить запрос
      headers: { 'content-type': 'application/json', 'user-agent': 'PixelPlanner/1.0' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`telegram ${method} ${String(res.status)}`);
    return res.json();
  };
  const ok = async (p: Promise<unknown>) => {
    await p;
  };
  return {
    send: (chatId, text, button) =>
      ok(call('sendMessage', { chat_id: chatId, text, ...(button ? { reply_markup: { inline_keyboard: [['data' in button ? { text: button.text, callback_data: button.data } : { text: button.text, web_app: { url: button.webApp } }]] } } : {}) })),
    answer: (callbackId) => ok(call('answerCallbackQuery', { callback_query_id: callbackId })),
    typing: (chatId) => ok(call('sendChatAction', { chat_id: chatId, action: 'typing' })),
    download: async (fileId) => {
      const meta = (await call('getFile', { file_id: fileId })) as { result?: { file_path?: string; file_size?: number } };
      const path = meta.result?.file_path;
      if (!path || !/^[\w./-]+$/.test(path)) throw new Error('telegram getFile: no path');
      if ((meta.result?.file_size ?? 0) > MAX_FILE) throw new Error('telegram file too large');
      const res = await fetch(`${relay}/out/${key}/file/bot${token}/${path}`, { headers: { 'user-agent': 'PixelPlanner/1.0' }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`telegram file ${String(res.status)}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length > MAX_FILE) throw new Error('telegram file too large');
      return buf;
    },
  };
}

interface Update {
  message?: { text?: string; voice?: { file_id: string; duration?: number }; chat: { id: number; type: string }; from?: { id: number } };
  callback_query?: { id: string; data?: string; from: { id: number }; message?: { chat: { id: number } } };
}

export type BotEvent =
  | { kind: 'text'; chatId: number; telegramId: string; text: string }
  | { kind: 'voice'; chatId: number; telegramId: string; fileId: string; duration: number }
  | { kind: 'button'; chatId: number; telegramId: string; callbackId: string; data: string };

/** Что пришло от Telegram; всё, кроме личных сообщений и нажатий на кнопку, не интересует. */
export function parseUpdate(raw: unknown): BotEvent | null {
  const u = raw as Update;
  const m = u.message;
  if (m?.from && m.chat.type === 'private' && typeof m.text === 'string') return { kind: 'text', chatId: m.chat.id, telegramId: String(m.from.id), text: m.text };
  if (m?.from && m.chat.type === 'private' && m.voice?.file_id) return { kind: 'voice', chatId: m.chat.id, telegramId: String(m.from.id), fileId: m.voice.file_id, duration: m.voice.duration ?? 0 };
  const c = u.callback_query;
  if (c?.message && typeof c.data === 'string') return { kind: 'button', chatId: c.message.chat.id, telegramId: String(c.from.id), callbackId: c.id, data: c.data };
  return null;
}
