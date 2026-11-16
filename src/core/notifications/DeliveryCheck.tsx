/*
 * «Проверка доставки»: что сервер знает об уведомлениях этого аккаунта. Видно, на какие устройства
 * уходят напоминания, когда последнее дошло, какая была ошибка и получил ли сервер свежее расписание.
 */
import { useState } from 'react';
import { pushStatus, type PushStatus } from '../auth/api';
import { useAuth } from '../auth/store';
import { Button, toast } from '../ui';
import { getPushState, resendSchedule } from './push';
import { tick } from './scheduler';

const KIND: Record<string, string> = {
  apple: 'iPhone / Mac (Apple)',
  google: 'Chrome / Android',
  mozilla: 'Firefox',
  windows: 'Edge / Windows',
  telegram: 'Telegram-бот',
  other: 'Браузер',
};

const pad = (n: number) => String(n).padStart(2, '0');
/** «сегодня 21:00», «вчера 9:05», «12.11 21:00». */
function when(ms: number, now: number): string {
  const d = new Date(ms);
  const t = `${String(d.getHours())}:${pad(d.getMinutes())}`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(new Date(now))) / 86_400_000);
  if (diff === 0) return `сегодня ${t}`;
  if (diff === -1) return `вчера ${t}`;
  if (diff === 1) return `завтра ${t}`;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${t}`;
}

/** 1 напоминание, 2 напоминания, 5 напоминаний. */
function reminders(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? 'напоминание' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'напоминания' : 'напоминаний';
  return `${String(n)} ${word}`;
}

const muted = { color: 'var(--c-text-muted)' } as const;

export function DeliveryCheck() {
  const token = useAuth((s) => s.session?.token);
  const [st, setSt] = useState<PushStatus | null>(null);
  const [mine, setMine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!token) return null;

  const load = async () => {
    setBusy(true);
    try {
      // Сначала отправляем свежее расписание, чтобы проверка показала актуальное состояние
      resendSchedule();
      await tick();
      const [s, push] = await Promise.all([pushStatus(token), getPushState()]);
      setSt(s);
      setMine(push?.enabled ? push.deviceId : null);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось проверить', 'alert', 'var(--c-warn)');
    } finally {
      setBusy(false);
    }
  };

  const stale = st?.schedule.rejectedAt && (!st.schedule.acceptedAt || st.schedule.rejectedAt > st.schedule.acceptedAt);
  const lostThis = st && mine && !st.devices.some((d) => d.id === mine);

  return (
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: '4px dashed var(--c-border)' }}>
      <Button variant="ghost" icon="bell" disabled={busy} onClick={() => void load()}>
        {busy ? 'Проверяем…' : st ? 'Проверить ещё раз' : 'Проверка доставки'}
      </Button>
      {st && (
        <div style={{ marginTop: 12, overflowWrap: 'anywhere' }}>
          <p style={{ margin: '0 0 8px' }}>
            Расписание на сервере:{' '}
            {st.schedule.acceptedAt ? (
              <>
                <b>{reminders(st.schedule.count)}</b> на неделю, обновлено {when(st.schedule.acceptedAt, st.now)}
              </>
            ) : (
              <b style={{ color: 'var(--c-warn)' }}>ещё не получено</b>
            )}
          </p>
          {stale && (
            <p style={{ margin: '0 0 8px', color: 'var(--c-warn)' }}>
              Последнее расписание ({when(st.schedule.rejectedAt ?? 0, st.now)}) пришло с устаревшими данными и не принято — его пришлют заново после синхронизации.
            </p>
          )}
          {lostThis && (
            <p style={{ margin: '0 0 8px', color: 'var(--c-warn)' }}>
              Сервер не знает это устройство — переподключаем push. Нажмите «Проверить ещё раз» через минуту.
            </p>
          )}
          {st.devices.length === 0 ? (
            <p style={{ margin: '0 0 8px', color: 'var(--c-warn)' }}>
              Ни одно устройство не подключено: напоминания при закрытом приложении приходить не будут.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
              {st.devices.map((d) => {
                const errLast = d.lastErrAt !== null && (d.lastOkAt === null || d.lastErrAt > d.lastOkAt);
                return (
                  <li key={d.id} style={{ padding: 8, border: '4px solid var(--c-border)' }}>
                    <b>{KIND[d.kind] ?? KIND.other}</b>
                    {d.id === mine && <span style={muted}> · это устройство</span>}
                    <div style={muted}>
                      Подключено {when(d.createdAt, st.now)}
                      {d.nextAt !== null ? ` · ждут: ${String(d.pending)}, ближайшее ${when(d.nextAt, st.now)}` : ' · ближайших напоминаний нет'}
                    </div>
                    <div style={{ color: errLast ? 'var(--c-warn)' : 'var(--c-habit)' }}>
                      {errLast
                        ? `Ошибка ${when(d.lastErrAt ?? 0, st.now)}: ${d.lastErr ?? ''}`
                        : d.lastOkAt !== null
                          ? `Последнее доставлено ${when(d.lastOkAt, st.now)}`
                          : 'Отправок ещё не было'}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {st.events.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary>Журнал ошибок ({st.events.length})</summary>
              <ul style={{ paddingLeft: 16, margin: '8px 0 0' }}>
                {st.events.map((e, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    <span style={muted}>
                      {when(e.at, st.now)}, {KIND[e.device] ?? e.device}:
                    </span>{' '}
                    {e.text}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
