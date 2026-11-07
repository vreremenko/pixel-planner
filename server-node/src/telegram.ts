/* Бот: привязка Telegram к аккаунту и вход. С этого сервера Telegram недоступен, поэтому запросы идут через посредника (relay/). */

export interface TelegramEnv {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_RELAY_URL?: string;
  TELEGRAM_RELAY_KEY?: string;
}

export interface Button {
  text: string;
  data: string;
}

export interface TelegramApi {
  send(chatId: number, text: string, button?: Button): Promise<void>;
  answer(callbackId: string): Promise<void>;
}

const TIMEOUT_MS = 10_000;

export function createTelegram(env: TelegramEnv): TelegramApi | undefined {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_RELAY_URL: relay, TELEGRAM_RELAY_KEY: key } = env;
  if (!token || !relay || !key) return undefined;
  const call = async (method: string, body: unknown) => {
    const res = await fetch(`${relay}/out/${key}/bot${token}/${method}`, {
      method: 'POST',
      // Без своего названия клиента Cloudflare может отклонить запрос
      headers: { 'content-type': 'application/json', 'user-agent': 'PixelPlanner/1.0' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`telegram ${method} ${String(res.status)}`);
  };
  return {
    send: (chatId, text, button) =>
      call('sendMessage', { chat_id: chatId, text, ...(button ? { reply_markup: { inline_keyboard: [[{ text: button.text, callback_data: button.data }]] } } : {}) }),
    answer: (callbackId) => call('answerCallbackQuery', { callback_query_id: callbackId }),
  };
}

interface Update {
  message?: { text?: string; chat: { id: number; type: string }; from?: { id: number } };
  callback_query?: { id: string; data?: string; from: { id: number }; message?: { chat: { id: number } } };
}

export type BotEvent = { kind: 'text'; chatId: number; telegramId: string; text: string } | { kind: 'button'; chatId: number; telegramId: string; callbackId: string; data: string };

/** Что пришло от Telegram; всё, кроме личных сообщений и нажатий на кнопку, не интересует. */
export function parseUpdate(raw: unknown): BotEvent | null {
  const u = raw as Update;
  const m = u.message;
  if (m?.from && m.chat.type === 'private' && typeof m.text === 'string') return { kind: 'text', chatId: m.chat.id, telegramId: String(m.from.id), text: m.text };
  const c = u.callback_query;
  if (c?.message && typeof c.data === 'string') return { kind: 'button', chatId: c.message.chat.id, telegramId: String(c.from.id), callbackId: c.id, data: c.data };
  return null;
}
