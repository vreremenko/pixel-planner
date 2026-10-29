import { type Store as Blobs } from '@netlify/blobs';
import type { Device, DueRow, ScheduleItem, Store, SyncIn, SyncRow } from './types.ts';

/*
 * Хранилище на Netlify Blobs (ключ → значение, с условной записью). Ключи:
 *   s/<space>/c                          → последний выданный порядковый номер изменения (счётчик)
 *   s/<space>/q/<пачка>/<seq>            → запись {t, id, u, d}; пачка = seq / 100 — чтобы забирать новое, не перечисляя всё
 *   s/<space>/r/<t>/<id>                 → {seq, u}: где лежит запись и её updatedAt (для слияния)
 *   d/<deviceId>                         → подписка устройства
 *   m/<deviceId>/<key>                   → напоминание {…, sent}
 *   u/<YYYYMMDD>/<fireAt>/<dev>/<key>    → индекс «ещё не отправлено» по дню срабатывания (cron смотрит вчера и сегодня)
 *
 * Номер изменения занимается условной записью (onlyIfNew): два устройства не получат один и тот же номер, а
 * счётчик увеличивается только после записи, поэтому читатель никогда не увидит «дыру» ниже счётчика.
 */

const SEQ_W = 12;
const BUCKET = 100;
const PARALLEL = 12;
const DAY = 86_400_000;
const pad = (n: number, w: number) => String(n).padStart(w, '0');
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');

type SyncValue = { t: string; id: string; u: number; d: string };
type Meta = { seq: number; u: number };
type Rem = ScheduleItem & { sent: boolean };
type Dev = { endpoint: string; p256dh: string; auth: string };

async function pmap<T, R>(items: T[], fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker));
  return out;
}

export class BlobsStore implements Store {
  constructor(private readonly store: Blobs) {}

  private get<T>(key: string): Promise<T | null> {
    return this.store.get(key, { type: 'json' }) as Promise<T | null>;
  }

  private qKey(space: string, seq: number): string {
    return `s/${space}/q/${pad(Math.floor(seq / BUCKET), 8)}/${pad(seq, SEQ_W)}`;
  }

  private async counter(space: string): Promise<{ n: number; etag?: string }> {
    const r = await this.store.getWithMetadata(`s/${space}/c`, { type: 'json' });
    return r ? { n: Number(r.data), etag: r.etag } : { n: 0 };
  }

  async syncPull(space: string, after: number, limit: number): Promise<SyncRow[]> {
    const { n: counter } = await this.counter(space);
    if (counter <= after) return [];
    const out: SyncRow[] = [];
    for (let b = Math.floor((after + 1) / BUCKET); b * BUCKET <= counter && out.length < limit; b++) {
      const prefix = `s/${space}/q/${pad(b, 8)}/`;
      const { blobs } = await this.store.list({ prefix });
      const seqs = blobs
        .map((x) => Number(x.key.slice(prefix.length)))
        .filter((n) => n > after && n <= counter)
        .sort((x, y) => x - y)
        .slice(0, limit - out.length);
      const vals = await pmap(seqs, (n) => this.get<SyncValue>(this.qKey(space, n)));
      seqs.forEach((n, i) => {
        const v = vals[i];
        if (v) out.push({ seq: n, ...v });
      });
    }
    return out;
  }

  async syncPush(space: string, records: SyncIn[]): Promise<void> {
    const latest = new Map<string, SyncIn>();
    for (const r of records) {
      const k = `${r.t}|${r.id}`;
      const cur = latest.get(k);
      if (!cur || cur.u < r.u) latest.set(k, r);
    }
    const all = [...latest.values()];
    for (let i = 0; i < all.length; i += 40) await this.pushBatch(space, all.slice(i, i + 40));
  }

  private async pushBatch(space: string, recs: SyncIn[]): Promise<void> {
    const rKey = (r: SyncIn) => `s/${space}/r/${r.t}/${r.id}`;
    const metas = await pmap(recs, (r) => this.get<Meta>(rKey(r)));
    const fresh = recs.map((r, i) => ({ r, old: metas[i] ?? null })).filter(({ r, old }) => !old || old.u < r.u);
    if (fresh.length === 0) return;

    let seq = (await this.counter(space)).n;
    const placed: { r: SyncIn; seq: number; old: Meta | null }[] = [];
    for (const { r, old } of fresh) {
      for (;;) {
        seq++;
        const res = await this.store.setJSON(this.qKey(space, seq), { t: r.t, id: r.id, u: r.u, d: r.d } satisfies SyncValue, { onlyIfNew: true });
        if (res.modified) break;
      }
      placed.push({ r, seq, old });
    }
    await pmap(placed, async ({ r, seq: s, old }) => {
      await this.store.setJSON(rKey(r), { seq: s, u: r.u } satisfies Meta);
      if (old) await this.store.delete(this.qKey(space, old.seq));
    });
    // Счётчик двигаем вперёд только после записи; параллельный писатель мог уйти дальше — тогда не трогаем
    for (let attempt = 0; attempt < 20; attempt++) {
      const cur = await this.counter(space);
      if (cur.n >= seq) return;
      const res = await this.store.setJSON(`s/${space}/c`, seq, cur.etag ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
      if (res.modified) return;
    }
    throw new Error('Netlify Blobs: не удалось обновить счётчик');
  }

  async syncDelete(space: string): Promise<void> {
    const { blobs } = await this.store.list({ prefix: `s/${space}/` });
    await pmap(blobs, (b) => this.store.delete(b.key));
  }

  async deviceExists(id: string): Promise<boolean> {
    return (await this.get<Dev>(`d/${id}`)) !== null;
  }

  deviceGet(id: string) {
    return this.get<Dev>(`d/${id}`);
  }

  async deviceUpsert(d: Device): Promise<void> {
    await this.store.setJSON(`d/${d.id}`, { endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth } satisfies Dev);
  }

  private uKey(fireAt: number, deviceId: string, key: string): string {
    return `u/${day(fireAt)}/${pad(fireAt, 14)}/${deviceId}/${encodeURIComponent(key)}`;
  }

  private async rems(deviceId: string): Promise<Rem[]> {
    const { blobs } = await this.store.list({ prefix: `m/${deviceId}/` });
    return (await pmap(blobs, (b) => this.get<Rem>(b.key))).filter((x): x is Rem => x !== null);
  }

  async deviceDelete(id: string): Promise<void> {
    const rems = await this.rems(id);
    await pmap(rems, async (r) => {
      await this.store.delete(`m/${id}/${encodeURIComponent(r.key)}`);
      await this.store.delete(this.uKey(r.fireAt, id, r.key));
    });
    await this.store.delete(`d/${id}`);
  }

  async scheduleReplace(deviceId: string, items: ScheduleItem[], now: number): Promise<void> {
    const existing = new Map((await this.rems(deviceId)).map((r) => [r.key, r]));
    const wanted = new Set(items.map((i) => i.key));
    // Старое: неотправленное, которого больше нет в расписании, и давно отправленное
    const drop = [...existing.values()].filter((r) => (!r.sent && !wanted.has(r.key)) || (r.sent && r.fireAt < now - 3 * DAY));
    await pmap(drop, async (r) => {
      await this.store.delete(`m/${deviceId}/${encodeURIComponent(r.key)}`);
      await this.store.delete(this.uKey(r.fireAt, deviceId, r.key));
    });
    // Новое и изменившееся (отправленные с тем же ключом не дублируем)
    const write = items.filter((i) => {
      const e = existing.get(i.key);
      return !e || (!e.sent && (e.fireAt !== i.fireAt || e.title !== i.title || e.body !== i.body || e.kind !== i.kind || e.ref !== i.ref));
    });
    await pmap(write, async (i) => {
      const e = existing.get(i.key);
      if (e && e.fireAt !== i.fireAt) await this.store.delete(this.uKey(e.fireAt, deviceId, i.key));
      await this.store.setJSON(`m/${deviceId}/${encodeURIComponent(i.key)}`, { ...i, sent: false } satisfies Rem);
      await this.store.setJSON(this.uKey(i.fireAt, deviceId, i.key), 1);
    });
  }

  async reminderSnooze(deviceId: string, item: ScheduleItem): Promise<void> {
    const old = await this.get<Rem>(`m/${deviceId}/${encodeURIComponent(item.key)}`);
    if (old) await this.store.delete(this.uKey(old.fireAt, deviceId, item.key));
    await this.store.setJSON(`m/${deviceId}/${encodeURIComponent(item.key)}`, { ...item, sent: false } satisfies Rem);
    await this.store.setJSON(this.uKey(item.fireAt, deviceId, item.key), 1);
  }

  async dueReminders(now: number, limit: number): Promise<DueRow[]> {
    const days = [...new Set([day(now - DAY), day(now)])];
    const keys: { fireAt: number; deviceId: string; key: string; blob: string }[] = [];
    for (const d of days) {
      const prefix = `u/${d}/`;
      const { blobs } = await this.store.list({ prefix });
      for (const b of blobs) {
        const [fireAt, deviceId, key] = b.key.slice(prefix.length).split('/');
        if (fireAt && deviceId && key && Number(fireAt) <= now) keys.push({ fireAt: Number(fireAt), deviceId, key: decodeURIComponent(key), blob: b.key });
      }
    }
    keys.sort((a, b) => a.fireAt - b.fireAt);
    const out: DueRow[] = [];
    const devs = new Map<string, Dev | null>();
    for (const k of keys.slice(0, limit)) {
      const rem = await this.get<Rem>(`m/${k.deviceId}/${encodeURIComponent(k.key)}`);
      if (!rem || rem.sent) {
        await this.store.delete(k.blob);
        continue;
      }
      if (!devs.has(k.deviceId)) devs.set(k.deviceId, await this.get<Dev>(`d/${k.deviceId}`));
      const dev = devs.get(k.deviceId);
      if (dev) out.push({ ...rem, deviceId: k.deviceId, ...dev });
    }
    return out;
  }

  async markSent(rows: { deviceId: string; key: string }[]): Promise<void> {
    await pmap(rows, async (r) => {
      const k = `m/${r.deviceId}/${encodeURIComponent(r.key)}`;
      const rem = await this.get<Rem>(k);
      if (!rem) return;
      await this.store.setJSON(k, { ...rem, sent: true });
      await this.store.delete(this.uKey(rem.fireAt, r.deviceId, r.key));
    });
  }
}
