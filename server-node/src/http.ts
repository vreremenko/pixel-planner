/* Общие помощники HTTP-обработчиков сервера. */
import type { HttpRes } from './types.ts';

export const MAX_BODY_BYTES = 256 * 1024;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Ответы с данными не должны оседать ни в чьём кэше. */
export const SAFE_HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
export const json = (data: unknown, status = 200): HttpRes => ({ status, headers: { ...SAFE_HEADERS }, body: JSON.stringify(data) });

export function readJson(body: string, limit = MAX_BODY_BYTES): unknown {
  if (body.length > limit) throw new HttpError(413, 'too large');
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new HttpError(400, 'bad json');
  }
}
