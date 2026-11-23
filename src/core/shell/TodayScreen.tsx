/*
 * «Сегодня»: сверху то, что делать сейчас и дальше (не больше двух пунктов), ниже весь день одним списком —
 * дела, привычки, платежи и тренировка вместе. Сделанное свёрнуто, пустой день показывает одно действие.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, Checkbox, Panel, PixelIcon, cx } from '../ui';
import type { TodayFeed, TodayItem } from '../module';
import { daySections, nextUp, relativeTime, toMinutes } from '../domain/today';
import { useModules } from './nav';
import s from './Today.module.css';

/** Сколько дел без времени показываем сразу; остальные — по кнопке. */
const UNTIMED_SHOWN = 5;

function nowMinutes(d = new Date()): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Минута сейчас: обновляется раз в полминуты, чтобы «через 40 мин» не залипало. */
function useNowMinutes(): number {
  const [now, setNow] = useState(nowMinutes);
  useEffect(() => {
    const id = window.setInterval(() => setNow(nowMinutes()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function Row({ item, hint }: { item: TodayItem; hint?: string | undefined }) {
  const sub = [item.detail, hint].filter(Boolean).join(' · ');
  return (
    <li className={cx(s.row, item.done && s.rowDone)}>
      {item.toggle ? (
        <Checkbox checked={item.done} onChange={(v) => void item.toggle?.(v)} label={`Выполнено: ${item.title}`} color="var(--c-task)" />
      ) : (
        <span className={s.mark} style={{ color: item.accent }} aria-hidden="true">
          <PixelIcon name={item.icon} size={20} />
        </span>
      )}
      <Link to={item.to} className={s.main}>
        <span className={s.title}>{item.title}</span>
        {sub && <span className={s.detail}>{sub}</span>}
      </Link>
      {item.time && <span className={cx(s.time, 'digits')}>{item.time}</span>}
    </li>
  );
}

export function TodayScreen({ today }: { today: string }) {
  const modules = useModules();
  const now = useNowMinutes();
  const [moreUntimed, setMoreUntimed] = useState(false);
  const [showDone, setShowDone] = useState(false);

  // Функции чтения подгружаются один раз; сами запросы идут уже по ссылке, чтобы список обновлялся при изменении данных
  const [loaders, setLoaders] = useState<((day: string) => Promise<TodayFeed>)[] | null>(null);
  useEffect(() => {
    const run = { cancelled: false };
    void Promise.all(modules.map((m) => m.loadToday?.() ?? Promise.resolve(null))).then((list) => {
      if (!run.cancelled) setLoaders(list.filter((f) => f !== null));
    });
    return () => {
      run.cancelled = true;
    };
  }, [modules]);
  const feeds = useLiveQuery(() => (loaders ? Promise.all(loaders.map((load) => load(today))) : []), [loaders, today]);
  const items = useMemo(() => (feeds ?? []).flatMap((f) => f.items), [feeds]);
  const stats = useMemo(() => (feeds ?? []).flatMap((f) => (f.stat ? [f.stat] : [])), [feeds]);

  const next = useMemo(() => nextUp(items), [items]);
  const sections = useMemo(() => daySections(items), [items]);

  if (!feeds || !loaders) return null;

  return (
    <div className={s.stack}>
      {stats.length > 0 && (
        <div className={s.strip}>
          {stats.map((st) => (
            <Link key={st.id} to={st.to} className={s.stat} style={{ '--accent': st.accent } as React.CSSProperties}>
              <span className={s.statLabel}>{st.label}</span>
              <b>{st.value}</b>
            </Link>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <Panel title="День свободен" icon="flag" accent="var(--c-gold)">
          <p style={{ marginTop: 0 }}>На сегодня ничего не запланировано. Добавьте первое дело — например, «Позвонить маме в 19:00» — или нажмите щит внизу и скажите голосом.</p>
          <Link to="/day">
            <Button variant="primary" icon="plus">
              Добавить задачу
            </Button>
          </Link>
        </Panel>
      ) : (
        <>
          {next.length > 0 ? (
            <Panel title="Сейчас и дальше" icon="target" accent="var(--c-gold)">
              <ul className={s.list}>
                {next.map((it, i) => (
                  <Row key={it.id} item={it} hint={i === 0 || it.time ? relativeTime(it.time, now) : undefined} />
                ))}
              </ul>
            </Panel>
          ) : (
            <Panel title="Сейчас и дальше" icon="target" accent="var(--c-gold)">
              <p style={{ margin: 0 }}>Всё на сегодня сделано. Можно отдыхать.</p>
            </Panel>
          )}

          <Panel title="Весь день" icon="calendar" accent="var(--c-task)">
            {sections.timed.length === 0 && sections.untimed.length === 0 && <p className={s.dim}>Несделанного не осталось.</p>}
            {sections.timed.length > 0 && (
              <ul className={s.list}>
                {sections.timed.map((it) => (
                  <Row key={it.id} item={it} hint={toMinutes(it.time ?? '0') < now ? 'просрочено' : undefined} />
                ))}
              </ul>
            )}
            {sections.untimed.length > 0 && (
              <>
                <h3 className={s.group}>Без времени</h3>
                <ul className={s.list}>
                  {(moreUntimed ? sections.untimed : sections.untimed.slice(0, UNTIMED_SHOWN)).map((it) => (
                    <Row key={it.id} item={it} />
                  ))}
                </ul>
                {sections.untimed.length > UNTIMED_SHOWN && !moreUntimed && (
                  <Button small variant="ghost" onClick={() => setMoreUntimed(true)}>
                    Ещё {sections.untimed.length - UNTIMED_SHOWN}
                  </Button>
                )}
              </>
            )}
            {sections.done.length > 0 && (
              <>
                <button type="button" className={s.doneToggle} aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
                  <PixelIcon name={showDone ? 'up' : 'down'} size={16} />
                  Сделано: {sections.done.length}
                </button>
                {showDone && (
                  <ul className={s.list}>
                    {sections.done.map((it) => (
                      <Row key={it.id} item={it} />
                    ))}
                  </ul>
                )}
              </>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
