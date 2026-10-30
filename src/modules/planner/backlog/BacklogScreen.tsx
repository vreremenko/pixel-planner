import { useMemo, useRef, useState, type CSSProperties } from 'react';
import s from './Backlog.module.css';
import { Button, Checkbox, Panel, PixelIcon, Segmented, cx, inputClass, toast } from '../../../core/ui';
import { useBacklog } from '../data/hooks';
import { useUi } from '../stores/ui';
import { useToday } from '../../../core/shell/useToday';
import { useHotkeys } from '../../../core/shell/hotkeys';
import { scheduleTask, toggleTask } from '../services/tasks';
import type { Task } from '../domain/types';
import { CalendarPicker } from '../day/CalendarPicker';
import { PRIORITY_COLOR, PRIORITY_SHORT } from '../day/labels';
import { addDays, formatDateLong } from '../../../core/domain/dates';
import { checklistProgress } from '../domain/checklist';
import { hasAllTags, normalizeTag, tagCounts } from '../domain/tags';

type Show = 'open' | 'done' | 'all';
const PRIO_RANK = { high: 0, medium: 1, low: 2 } as const;

export function BacklogScreen() {
  const all = useBacklog();
  const todayDate = useToday();
  const openEditor = useUi((st) => st.openEditor);
  const [query, setQuery] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [show, setShow] = useState<Show>('open');
  const [scheduling, setScheduling] = useState<Task | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useHotkeys(
    useMemo(
      () => ({
        n: () => openEditor({ kind: 'new', date: null }),
        '/': () => searchRef.current?.focus(),
      }),
      [openEditor],
    ),
  );

  const allTags = useMemo(() => tagCounts((all ?? []).map((t) => t.tags)), [all]);
  const toggleTag = (tag: string) => setTags((cur) => (cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag]));
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (all ?? [])
      .filter((t) => (show === 'all' ? true : show === 'done' ? t.done : !t.done))
      .filter((t) => hasAllTags(t.tags, tags))
      .filter((t) => !q || t.title.toLowerCase().includes(q) || (t.notes ?? '').toLowerCase().includes(q) || (t.checklist ?? []).some((c) => c.text.toLowerCase().includes(q)) || t.tags.some((x) => x.toLowerCase().includes(q)))
      .sort((a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || b.createdAt - a.createdAt);
  }, [all, query, tags, show]);

  const plan = async (t: Task, date: string) => {
    await scheduleTask(t, date);
    toast(`Запланировано: ${formatDateLong(date)}`, 'calendar', 'var(--c-task)');
  };

  return (
    <>
      <h1 className="glow pageTitle" style={{ color: 'var(--c-backlog)', marginBottom: 16 }}>
        Бэклог
      </h1>
      <Panel
        title="Задачи без даты"
        icon="chest"
        accent="var(--c-backlog)"
        actions={
          <Button variant="primary" icon="plus" small onClick={() => openEditor({ kind: 'new', date: null })}>
            Задача
          </Button>
        }
      >
        <div className={s.toolbar}>
          <div className={s.search}>
            <PixelIcon name="search" size={16} />
            <label htmlFor="backlog-search" className="sr-only">
              Поиск
            </label>
            <input
              id="backlog-search"
              ref={searchRef}
              className={inputClass}
              placeholder="Поиск ( / )"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Segmented
            label="Показывать"
            value={show}
            onChange={setShow}
            options={[
              { value: 'open', label: 'Открытые' },
              { value: 'done', label: 'Готовые' },
              { value: 'all', label: 'Все' },
            ]}
          />
        </div>
        {allTags.length > 0 && (
          <div className={s.tags} role="group" aria-label="Фильтр по тегам">
            {allTags.map(({ tag, count }) => (
              <button key={tag} type="button" className={s.tag} aria-pressed={tags.includes(tag)} onClick={() => toggleTag(tag)}>
                #{tag} <span className="digits">{count}</span>
              </button>
            ))}
            {tags.length > 0 && (
              <Button small variant="ghost" onClick={() => setTags([])}>
                Сбросить
              </Button>
            )}
          </div>
        )}
        <p className={s.count} aria-live="polite">
          Задач: {list.length}
        </p>
        {all && list.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--c-text-dim)', padding: '24px 0' }}>
            <PixelIcon name="bag" size={48} />
            <p>{all.length === 0 ? 'Бэклог пуст. Складывайте сюда задачи без даты.' : 'Ничего не найдено.'}</p>
          </div>
        )}
        <ul className={s.grid}>
          {list.map((t) => (
            <li key={t.id} className={cx(s.card, t.done && s.done)} style={{ '--prio': PRIORITY_COLOR[t.priority] } as CSSProperties}>
              <Checkbox checked={t.done} onChange={(d) => void toggleTask(t, d)} label={`Выполнено: ${t.title}`} color="var(--c-backlog)" />
              <div className={s.cardMain}>
              <button className={s.cardBody} onClick={() => openEditor({ kind: 'task', task: t })} aria-label={`Редактировать «${t.title}»`}>
                <div className={s.cardTitle}>{t.title}</div>
                <div className={s.cardMeta}>
                  <span style={{ color: PRIORITY_COLOR[t.priority] }}>{PRIORITY_SHORT[t.priority]}</span>
                  {t.checklist && t.checklist.length > 0 && (
                    <span title="Чек-лист" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--c-task)' }}>
                      <PixelIcon name="check" size={16} />
                      {checklistProgress(t.checklist).done}/{t.checklist.length}
                    </span>
                  )}
                </div>
              </button>
              {t.tags.length > 0 && (
                <div className={s.cardTags} role="group" aria-label="Метки">
                  {t.tags.map((x) => {
                    const tag = normalizeTag(x);
                    return (
                      <button key={x} type="button" className={cx(s.cardTag, tags.includes(tag) && s.cardTagOn)} aria-pressed={tags.includes(tag)} title="Фильтр по метке" onClick={() => toggleTag(tag)}>
                        #{tag}
                      </button>
                    );
                  })}
                </div>
              )}
              </div>
              {!t.done && (
                <div className={s.cardActions}>
                  <Button small variant="ghost" icon="sun" label="На сегодня" onClick={() => void plan(t, todayDate)} />
                  <Button small variant="ghost" icon="right" label="На завтра" onClick={() => void plan(t, addDays(todayDate, 1))} />
                  <Button small variant="ghost" icon="calendar" label="Запланировать на дату…" onClick={() => setScheduling(t)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </Panel>
      {scheduling && (
        <CalendarPicker
          open
          title="Запланировать на…"
          value={todayDate}
          todayDate={todayDate}
          onPick={(d) => void plan(scheduling, d)}
          onClose={() => setScheduling(null)}
        />
      )}
    </>
  );
}
