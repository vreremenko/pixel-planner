import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptBackup, encryptBackup, parseKey } from './backup-crypto.ts';

describe('шифрование копии базы', () => {
  const key = randomBytes(32);
  const data = Buffer.from('SQLite format 3\0'.repeat(500));

  it('расшифровывается тем же ключом и сжимается', () => {
    const enc = encryptBackup(data, key);
    expect(enc.length).toBeLessThan(data.length);
    expect(enc.includes(Buffer.from('SQLite'))).toBe(false);
    expect(decryptBackup(enc, key).equals(data)).toBe(true);
  });

  it('чужой ключ и испорченный файл не проходят', () => {
    const enc = encryptBackup(data, key);
    expect(() => decryptBackup(enc, randomBytes(32))).toThrow();
    const broken = Buffer.from(enc);
    broken[20] = (broken[20] ?? 0) ^ 1;
    expect(() => decryptBackup(broken, key)).toThrow();
    expect(() => decryptBackup(Buffer.from('hello world, not a backup'), key)).toThrow('это не копия');
  });

  it('ключ — ровно 32 байта в base64', () => {
    expect(parseKey(key.toString('base64'))?.equals(key)).toBe(true);
    expect(parseKey(randomBytes(16).toString('base64'))).toBeNull();
    expect(parseKey(undefined)).toBeNull();
  });
});
