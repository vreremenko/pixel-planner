/* Пароли, токены сессий и ограничитель попыток — без привязки к хранилищу. */
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const N = 16_384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEYLEN, { N: n, r, p }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/** Хеш пароля: scrypt с отдельной солью; в базе лежит только он, пароль сервер не хранит. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return `scrypt$${String(N)}$${String(R)}$${String(P)}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await derive(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Токен сессии: 32 случайных байта; на сервере хранится только его SHA-256. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export const tokenHash = (token: string): string => createHash('sha256').update(token).digest('hex');

export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isValidEmail = (email: string): boolean => email.length <= 254 && EMAIL_RE.test(email);

const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const isValidPassword = (password: string): boolean => password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX;

/** Скользящее окно: не больше max событий за windowMs для каждого ключа. Хранится в памяти процесса. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  /** Сколько событий уже было за окно (без добавления нового). */
  count(key: string, windowMs: number, now: number): number {
    const fresh = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (fresh.length > 0) this.hits.set(key, fresh);
    else this.hits.delete(key);
    return fresh.length;
  }

  add(key: string, now: number): void {
    this.hits.set(key, [...(this.hits.get(key) ?? []), now]);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}
