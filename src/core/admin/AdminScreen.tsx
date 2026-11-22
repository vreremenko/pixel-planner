/* Админка: сколько людей пользуется приложением и чем. Только количества, содержимое записей сервер сюда не отдаёт. */
import { useEffect, useState } from 'react';
import { adminStats } from '../auth/api';
import { useAuth } from '../auth/store';
import { BarChart } from '../charts/BarChart';
import { dateOf, formatDateShort } from '../domain/dates';
import { Button, Panel } from '../ui';
import s from './Admin.module.css';

interface AiUsage {
  phrases: number;
  calls: number;
  tokensIn: number;
  tokensOut: number;
  voice: number;
}

/** Расход с оценками сервера: нейроны Workers AI и рубли (прикидка). */
interface Priced extends AiUsage {
  neurons: number;
  haikuRub: number;
  workersRub: number;
}

interface Stats {
  /** Нет у старого сервера, пока не обновился. */
  ai?: { today: Priced; week: Priced; month: Priced; freeUsedPct?: number; perPhrase?: Priced | null; rubPerUsd?: number; days: { date: string; tokens: number }[]; freeNeurons: number; perUserDay: number };
  since: string | null;
  users: { total: number; new7: number; new30: number; withPush: number };
  active: { day: number; week: number; month: number };
  returned: { previous: number; back: number };
  days: { date: string; users: number }[];
  modules: { name: string; records: number; users: number; active: number }[];
  list: { email: string; admin: boolean; verified: boolean; telegram: boolean; createdAt: number; lastSeen: number | null; sessions: number; pushDevices: number; version: string | null; activeDays: number; records: Record<string, number>; ai?: { today: Priced; week: Priced } }[];
}

const num = (n: number) => n.toLocaleString('ru-RU');
const tokens = (u: AiUsage) => num(u.tokensIn + u.tokensOut);
/** Рубли с копейками: мелкие суммы — до копейки, крупные — до рубля. */
const rub = (n: number | undefined) => {
  const v = n ?? 0;
  if (v === 0) return '0 ₽';
  if (v < 0.01) return '< 1 коп.';
  return `${v.toLocaleString('ru-RU', { maximumFractionDigits: v < 100 ? 2 : 0 })} ₽`;
};
const pct = (n: number) => `${n.toLocaleString('ru-RU', { maximumFractionDigits: n < 10 ? 1 : 0 })}%`;

function AiPanel({ ai, list }: { ai: NonNullable<Stats['ai']>; list: Stats['list'] }) {
  const users = list.filter((u) => u.ai && (u.ai.week.phrases > 0 || u.ai.week.calls > 0 || u.ai.week.voice > 0)).sort((a, b) => (b.ai?.week.tokensIn ?? 0) + (b.ai?.week.tokensOut ?? 0) - ((a.ai?.week.tokensIn ?? 0) + (a.ai?.week.tokensOut ?? 0)));
  return (
    <Panel title="Нейросеть" icon="potion" accent="var(--c-gold)">
      <div className={s.metrics}>
        <Metric label="Токенов сегодня" value={tokens(ai.today)} />
        <Metric label="Фраз сегодня" value={ai.today.phrases} />
        <Metric label="Токенов за 7 дней" value={tokens(ai.week)} />
        <Metric label="За 30 дней" value={tokens(ai.month)} />
        <Metric label="Бесплатного лимита сегодня" value={ai.freeUsedPct === undefined ? '—' : pct(ai.freeUsedPct)} />
        <Metric label="На Haiku сегодня" value={rub(ai.today.haikuRub)} />
        <Metric label="На Haiku за 30 дней" value={rub(ai.month.haikuRub)} />
        <Metric label="Фраза на Haiku" value={ai.perPhrase ? rub(ai.perPhrase.haikuRub) : '—'} />
      </div>
      <div className={s.chart}>
        <BarChart title="Токены по дням" color="var(--c-gold)" rows={16} bars={ai.days.map((d) => ({ label: d.date.slice(8), value: d.tokens, hint: `${formatDateShort(d.date)}: ${num(d.tokens)}` }))} />
      </div>
      <p className={s.hint}>
        Сегодня: обращений к модели {ai.today.calls}, токенов на входе {num(ai.today.tokensIn)}, на выходе {num(ai.today.tokensOut)}, голосовых {ai.today.voice}, ≈ {num(ai.today.neurons)} из {num(ai.freeNeurons)} бесплатных «нейронов» Cloudflare (сброс в 03:00 по Москве). Одному человеку — до {ai.perUserDay} фраз в сутки.
      </p>
      {ai.perPhrase && (
        <p className={s.hint}>
          Прикидка на будущее (по средней фразе за 30 дней — {num(Math.round(ai.perPhrase.tokensIn + ai.perPhrase.tokensOut))} токенов): 1 000 фраз в день на Haiku ≈ {rub(ai.perPhrase.haikuRub * 1000)} в день, {rub(ai.perPhrase.haikuRub * 30_000)} в месяц. Тот же расход на Workers AI сверх бесплатного ≈ {rub(ai.perPhrase.workersRub * 30_000)} в месяц.
        </p>
      )}
      <p className={s.hint}>
        Всё это оценка: нейроны — по прайсу glm-4.7-flash, голосовое — как ~15 секунд, Haiku 5.5 — $0,10 / $0,50 за миллион токенов, курс {ai.rubPerUsd ?? 80} ₽ за доллар; распознавание голоса в цену Haiku не входит. Точный остаток — в панели Cloudflare.
      </p>
      {users.length === 0 && <p className={s.hint}>За неделю нейросетью никто не пользовался.</p>}
      <ul className={s.list}>
        {users.map((u) => (
          <li key={u.email} className={s.row}>
            <span className={s.grow}>
              {u.email.endsWith('@telegram.invalid') ? `Telegram ${u.email.slice(2, -17)}` : u.email}
              <br />
              <span className={s.dim}>
                сегодня: фраз {u.ai?.today.phrases ?? 0}, токенов {u.ai ? tokens(u.ai.today) : 0} · за 7 дней: фраз {u.ai?.week.phrases ?? 0}, голосовых {u.ai?.week.voice ?? 0}, на Haiku ≈ {rub(u.ai?.week.haikuRub)}
              </span>
            </span>
            <span className={s.dim}>{u.ai ? tokens(u.ai.week) : 0} ток.</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
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
  const { users, active, returned, days, modules, list, since, ai } = stats;
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
      {ai && <AiPanel ai={ai} list={list} />}
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
                {u.email.endsWith('@telegram.invalid') ? `Telegram ${u.email.slice(2, -17)}` : u.email}
                {u.admin ? ' · админ' : ''}
                {u.verified ? '' : ' · почта не подтверждена'}
                {u.telegram ? ' · Telegram' : ''}
                <br />
                <span className={s.dim}>
                  С {shortDay(u.createdAt)} · последний вход: {u.lastSeen === null ? 'нет сессий' : shortDay(u.lastSeen)} · дней за месяц: {u.activeDays} · устройств: {u.sessions} · с уведомлениями: {u.pushDevices} · версия: {u.version ?? 'неизвестна'}
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
