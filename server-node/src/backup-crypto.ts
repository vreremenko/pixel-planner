/*
 * Шифрование копии базы перед отправкой за пределы сервера: сжатие и AES-256-GCM.
 * Формат файла: «PPB1», 12 байт IV, зашифрованные данные, 16 байт метки целостности.
 * Ключ (32 байта в base64) хранится в закрытых настройках сервера и у владельца в server-node/.env.vps.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';

const MAGIC = Buffer.from('PPB1');
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function parseKey(b64: string | undefined): Buffer | null {
  if (!b64) return null;
  const key = Buffer.from(b64, 'base64');
  return key.length === 32 ? key : null;
}

export function encryptBackup(data: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(gzipSync(data)), cipher.final()]);
  return Buffer.concat([MAGIC, iv, body, cipher.getAuthTag()]);
}

/** Бросает ошибку, если ключ не тот или файл повреждён. */
export function decryptBackup(file: Buffer, key: Buffer): Buffer {
  if (file.length < MAGIC.length + IV_BYTES + TAG_BYTES || !file.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('это не копия PIXEL PLANNER');
  const iv = file.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
  const tag = file.subarray(file.length - TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return gunzipSync(Buffer.concat([decipher.update(file.subarray(MAGIC.length + IV_BYTES, file.length - TAG_BYTES)), decipher.final()]));
}
