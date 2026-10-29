import { describe, expect, it } from 'vitest';
import { probe, verdict } from './probe';

describe('probe', () => {
  it('успешный ответ — ok и время', async () => {
    let t = 0;
    const r = await probe('https://x.test/', () => Promise.resolve(new Response('')), () => (t += 120));
    expect(r).toEqual({ ok: true, ms: 120 });
  });
  it('сетевая ошибка — не ok', async () => {
    const r = await probe('https://x.test/', () => Promise.reject(new TypeError('Failed to fetch')));
    expect(r.ok).toBe(false);
    expect(r.error).toBe('не открывается');
  });
  it('вердикт по времени', () => {
    expect(verdict({ ok: true, ms: 400 })).toBe('fast');
    expect(verdict({ ok: true, ms: 5000 })).toBe('slow');
    expect(verdict({ ok: false, ms: 50 })).toBe('down');
  });
});
