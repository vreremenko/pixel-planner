/* Админка: сколько людей пользуется приложением и чем. Только количества, содержимое записей сервер сюда не отдаёт. */
import { useEffect, useState } from 'react';
import { adminStats } from '../auth/api';
import { useAuth } from '../auth/store';
import { BarChart } from '../charts/BarChart';
import { dateOf, formatDateShort } from '../domain/dates';
import { Button, Panel } from '../ui';
import s from './Admin.module.css';

interface Stats {
  since: string | null;
  users: { total: number; new7: number; new30: number; withPush: number };
  active: { day: number; week: number; month: number };
  returned: { previous: number; back: number };
  days: { date: string; users: number }[];
  modules: { name: string; records: number; users: number; active: number }[];
  list: { email: string; admin: boolean; verified: boolean; telegram: boolean; createdAt: number; lastSeen: number | null; sessions: number; version: string | null; activeDays: number; records: Record<string, number> }[];
}

const shortDay = (ms: number) => formatDateShort(dateOf(new Date(ms)));

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={s.metric}>
      <span className={s.dim}>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function Report({ stats }: { stats: Stats }) {
  const { users, active, returned, days, modules, list, since } = stats;
  return (
    <>
      <Panel title="Пользователи" icon="user" accent="var(--c-gold)">
        <div className={s.metrics}>
          <Metric label="Всего" value={users.total} />
          <Metric label="Новых за 7 дней" value={users.new7} />
          <Metric label="Новых за 30 дней" value={users.new30} />
          <Metric label="С пушами" value={users.withPush} />
        </div>
      </Panel>
      <Panel title="Активность" icon="bars" accent="var(--c-gold)">
        <div className={s.metrics}>
          <Metric label="Сегодня" value={active.day} />
          <Metric label="За 7 дней" value={active.week} />
          <Metric label="За 30 дней" value={active.month} />
          <Metric label="Вернулись" value={returned.previous === 0 ? '—' : `${String(returned.back)} из ${String(returned.previous)}`} />
        </div>
        <div className={s.chart}>
          <BarChart title="Активные пользователи по дням" color="var(--c-gold)" rows={16} bars={days.map((d) => ({ label: d.date.slice(8), value: d.users, hint: `${formatDateShort(d.date)}: ${String(d.users)}` }))} />
        </div>
        <p className={s.hint}>«Вернулись»: сколько людей с прошлой недели заходили на этой. {since ? `История с ${formatDateShort(since)}.` : 'История начнётся с первых заходов.'}</p>
      </Panel>
      <Panel title="Разделы" icon="menu" accent="var(--c-gold)">
        {modules.length === 0 && <p className={s.hint}>Записей пока нет.</p>}
        <ul className={s.list}>
          {modules.map((m) => (
            <li key={m.name} className={s.row}>
              <span className={s.grow}>
                {m.name}
                <br />
                <span className={s.dim}>
                  за 7 дней: {m.active} из {m.users}
                </span>
              </span>
              <span className={s.dim}>{m.records} зап.</span>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Кто пользуется" icon="user" accent="var(--c-gold)">
        <ul className={s.list}>
          {list.map((u) => (
            <li key={u.email} className={s.row}>
              <span className={s.grow}>
                {u.email}
                {u.admin ? ' · админ' : ''}
                {u.verified ? '' : ' · почта не подтверждена'}
                {u.telegram ? ' · Telegram' : ''}
                <br />
                <span className={s.dim}>
                  С {shortDay(u.createdAt)} · последний вход: {u.lastSeen === null ? 'нет сессий' : shortDay(u.lastSeen)} · дней за месяц: {u.activeDays} · устройств: {u.sessions} · версия: {u.version ?? 'неизвестна'}
                </span>
                {Object.keys(u.records).length > 0 && (
                  <>
                    <br />
                    <span className={s.dim}>{Object.entries(u.records).map(([name, n]) => `${name} ${String(n)}`).join(' · ')}</span>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}

export function AdminScreen() {
  const token = useAuth((st) => st.session?.token);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) return;
    let live = true;
    adminStats<Stats>(token).then(
      (fresh) => {
        if (!live) return;
        setStats(fresh);
        setError(null);
      },
      (e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : 'Не получилось загрузить');
      },
    );
    return () => {
      live = false;
    };
  }, [token, attempt]);

  return (
    <div className={s.stack}>
      <h1 className="glow pageTitle" style={{ color: 'var(--c-gold)' }}>
        Админка
      </h1>
      {!token && <p className={s.hint}>Войдите в аккаунт.</p>}
      {error && (
        <Panel title="Ошибка" icon="alert" accent="var(--c-warn)">
          <p className={s.hint}>{error}</p>
          <Button small onClick={() => setAttempt((n) => n + 1)}>
            Повторить
          </Button>
        </Panel>
      )}
      {token && !stats && !error && <p className={s.hint}>Загрузка…</p>}
      {stats && <Report stats={stats} />}
    </div>
  );
}
