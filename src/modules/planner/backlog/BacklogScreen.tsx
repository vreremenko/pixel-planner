import { useMemo, useState, type CSSProperties } from 'react';
import s from './Backlog.module.css';
import { Button, ConfirmDialog, PixelIcon, Segmented, toast } from '../../../core/ui';
import { useBacklog } from '../data/hooks';
import { useUi } from '../stores/ui';
import { useToday } from '../../../core/shell/useToday';
import { useHotkeys } from '../../../core/shell/hotkeys';
import { deleteTask, scheduleTask, toggleChecklistItem, toggleTask } from '../services/tasks';
import { TaskItem } from '../day/TaskItem';
import type { Task } from '../domain/types';
import { CalendarPicker } from '../day/CalendarPicker';
import { formatDateLong } from '../../../core/domain/dates';
import { hasAllTags, tagCounts } from '../domain/tags';

type Show = 'open' | 'done' | 'all';
const PRIO_RANK = { high: 0, medium: 1, low: 2 } as const;

export function BacklogScreen() {
  const all = useBacklog();
  const todayDate = useToday();
  const openEditor = useUi((st) => st.openEditor);
  const [tags, setTags] = useState<string[]>([]);
  const [show, setShow] = useState<Show>('open');
  const [scheduling, setScheduling] = useState<Task | null>(null);
  const [askDelete, setAskDelete] = useState<Task | null>(null);

  useHotkeys(
    useMemo(
      () => ({
        n: () => openEditor({ kind: 'new', date: null }),
      }),
      [openEditor],
    ),
  );

  const allTags = useMemo(() => tagCounts((all ?? []).map((t) => t.tags)), [all]);
  const toggleTag = (tag: string) =>
    setTags((cur) => (cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag]));
  const list = useMemo(() => {
    return (all ?? [])
      .filter((t) => (show === 'all' ? true : show === 'done' ? t.done : !t.done))
      .filter((t) => hasAllTags(t.tags, tags))
      .sort((a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || b.createdAt - a.createdAt);
  }, [all, tags, show]);

  const plan = async (t: Task, date: string) => {
    await scheduleTask(t, date);
    toast(`Запланировано: ${formatDateLong(date)}`, 'calendar', 'var(--c-task)');
  };

  return (
    <>
      <h1 className="glow pageTitle" style={{ color: 'var(--c-backlog)', marginBottom: 16 }}>
        Бэклог
      </h1>
      <div className={s.head}>
        <Segmented
          label="Показывать"
          value={show}
          accent="var(--c-backlog)"
          onChange={setShow}
          options={[
            { value: 'open', label: 'Открытые' },
            { value: 'done', label: 'Готовые' },
            { value: 'all', label: 'Все' },
          ]}
        />
        <Button
          variant="primary"
          icon="plus"
          small
          style={{ '--bc': 'var(--c-backlog)', '--bg': 'var(--c-backlog)' } as CSSProperties}
          onClick={() => openEditor({ kind: 'new', date: null })}
        >
          Задача
        </Button>
      </div>
      <section aria-label="Задачи без даты">
        {allTags.length > 0 && (
          <div className={s.tags} role="group" aria-label="Фильтр по тегам">
            {allTags.map(({ tag, count }) => (
              <button
                key={tag}
                type="button"
                className={s.tag}
                aria-pressed={tags.includes(tag)}
                onClick={() => toggleTag(tag)}
              >
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
            <p>
              {all.length === 0
                ? 'Бэклог пуст. Складывайте сюда задачи без даты.'
                : 'Ничего не найдено.'}
            </p>
          </div>
        )}
        <ul className={s.list} aria-label="Задачи без даты">
          {list.map((t) => (
            <TaskItem
              key={t.id}
              id={t.id}
              item={{ kind: 'task', task: t }}
              noGrip
              dragDisabled
              onToggle={(d) => void toggleTask(t, d)}
              onToggleItem={(itemId) => void toggleChecklistItem(t, itemId)}
              onEdit={() => openEditor({ kind: 'task', task: t })}
              onTagClick={toggleTag}
              activeTags={tags}
              onSwipeDelete={() => setAskDelete(t)}
              swipeRight={{
                label: 'На сегодня',
                icon: 'sun',
                onSwipe: () => void plan(t, todayDate),
              }}
            />
          ))}
        </ul>
      </section>
      <ConfirmDialog
        open={askDelete !== null}
        title="Удалить задачу?"
        onClose={() => setAskDelete(null)}
        onConfirm={() => {
          if (askDelete)
            void deleteTask(askDelete.id).then(() => toast('Удалено', 'trash', 'var(--c-warn)'));
        }}
      >
        {askDelete ? `«${askDelete.title}» будет удалена.` : ''}
      </ConfirmDialog>
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
