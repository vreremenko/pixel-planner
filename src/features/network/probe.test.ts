import { describe, expect, it } from 'vitest';
import { probe, probeBody, verdict } from './probe';

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
  it('probeBody: ответ скачивается целиком', async () => {
    let t = 0;
    const r = await probeBody('https://x.test/', () => Promise.resolve(new Response('x'.repeat(1000))), () => (t += 50));
    expect(r).toEqual({ ok: true, ms: 50 });
  });
  it('probeBody: ошибка сервера — не ok', async () => {
    const r = await probeBody('https://x.test/', () => Promise.resolve(new Response('', { status: 404 })));
    expect(r.ok).toBe(false);
    expect(r.error).toBe('сервер ответил 404');
  });
});
