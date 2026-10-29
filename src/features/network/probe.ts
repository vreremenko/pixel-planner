/*
 * Проверка сети: какие серверы открываются с этого устройства и как быстро.
 * Запросы без CORS (no-cors) — нам важен сам факт ответа и время, а не содержимое.
 */
export interface ProbeTarget {
  id: string;
  label: string;
  url: string;
}

export interface ProbeResult {
  ok: boolean;
  ms: number;
  error?: string;
}

export const PROBE_TIMEOUT_MS = 12_000;

export async function probe(url: string, fetchFn: typeof fetch = fetch, now: () => number = () => performance.now()): Promise<ProbeResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  const t0 = now();
  try {
    await fetchFn(`${url}${url.includes('?') ? '&' : '?'}t=${String(Date.now())}`, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal });
    return { ok: true, ms: Math.round(now() - t0) };
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError';
    return { ok: false, ms: Math.round(now() - t0), error: aborted ? 'нет ответа за 12 с' : 'не открывается' };
  } finally {
    clearTimeout(timer);
  }
}

export const verdict = (r: ProbeResult): 'fast' | 'slow' | 'down' => (!r.ok ? 'down' : r.ms > 3000 ? 'slow' : 'fast');
