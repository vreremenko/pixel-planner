import { useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import s from './Day.module.css';
import { Button, Panel, PixelIcon, toast } from '../../ui';
import { useUi } from '../../stores/ui';
import { useToday } from '../../app/useToday';
import { useHotkeys } from '../../app/hotkeys';
import { useDay } from '../../data/hooks';
import { diffDays, formatDateLong } from '../../domain/dates';
import { hasAllTags, tagCounts } from '../../domain/tags';
import { ProgressBar } from '../../charts/ProgressBar';
import {
  moveUnfinishedToTomorrow,
  reorderDay,
  scheduleTask,
  toggleChecklistItem,
  toggleOccurrence,
  toggleOccurrenceChecklistItem,
  toggleTask,
  type DayItem,
} from '../../services/tasks';
import { TaskItem } from './TaskItem';
import { QuickAdd } from './QuickAdd';
import { TagBar } from './TagBar';
import { CalendarPicker } from './CalendarPicker';

const itemId = (it: DayItem) => (it.kind === 'task' ? it.task.id : it.occ.key);
const itemOrder = (it: DayItem) => (it.kind === 'task' ? it.task.order : it.occ.order);
const itemTime = (it: DayItem) => (it.kind === 'task' ? it.task.time : it.occ.time) ?? '99:99';
const itemTags = (it: DayItem) => (it.kind === 'task' ? it.task.tags : it.occ.tags);
const isDone = (it: DayItem) => (it.kind === 'task' ? it.task.done : it.occ.status === 'done');

function relativeLabel(diff: number): string {
  if (diff === 0) return 'СЕГОДНЯ';
  if (diff === 1) return 'ЗАВТРА';
  if (diff === -1) return 'ВЧЕРА';
  return diff > 0 ? `ЧЕРЕЗ ${diff} ДН.` : `${-diff} ДН. НАЗАД`;
}

export function DayScreen() {
  const todayDate = useToday();
  const { date, shiftDate, setDate, goToday, openEditor, calendarOpen, setCalendarOpen, tagFilter, toggleTag, clearTags } = useUi();
  const data = useDay(date, todayDate);

  const sorted = useMemo<DayItem[]>(() => {
    if (!data) return [];
    const items: DayItem[] = [
      ...data.tasks.map((task) => ({ kind: 'task' as const, task })),
      ...data.occurrences.map((occ) => ({ kind: 'occ' as const, occ })),
    ];
    return items.sort((a, b) => itemOrder(a) - itemOrder(b) || itemTime(a).localeCompare(itemTime(b)));
  }, [data]);

  // Локальный порядок для мгновенного отклика при перетаскивании
  const [items, setItems] = useState<DayItem[]>(sorted);
  const [prevSorted, setPrevSorted] = useState(sorted);
  if (prevSorted !== sorted) {
    setPrevSorted(sorted);
    setItems(sorted);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((x) => itemId(x) === active.id);
    const to = items.findIndex((x) => itemId(x) === over.id);
    const next = arrayMove(items, from, to);
    setItems(next);
    void reorderDay(next);
  };

  useHotkeys(
    useMemo(
      () => ({
        n: () => openEditor({ kind: 'new', date }),
        ArrowLeft: () => shiftDate(-1),
        ArrowRight: () => shiftDate(1),
        t: goToday,
      }),
      [date, openEditor, shiftDate, goToday],
    ),
  );

  // Метки дня и список с учётом выбранного фильтра
  const dayTags = useMemo(() => tagCounts(items.map(itemTags)), [items]);
  const filtering = tagFilter.length > 0;
  const visible = useMemo(() => (filtering ? items.filter((x) => hasAllTags(itemTags(x), tagFilter)) : items), [items, filtering, tagFilter]);

  const doneCount = visible.filter(isDone).length;
  const pendingTasks = visible.filter((x) => x.kind === 'task' && !x.task.done).length;
  const diff = diffDays(date, todayDate);

  return (
    <>
      <div className={s.header}>
        <Button icon="left" label="Предыдущий день (←)" onClick={() => shiftDate(-1)} />
        <div className={s.dateBlock}>
          <div className={s.stage}>{relativeLabel(diff)}</div>
          <h1 className={`${s.dateTitle} glow`}>{formatDateLong(date)}</h1>
        </div>
        <Button icon="right" label="Следующий день (→)" onClick={() => shiftDate(1)} />
        <Button icon="calendar" label="Календарь" onClick={() => setCalendarOpen(true)} />
        {diff !== 0 && (
          <Button small onClick={goToday}>
            Сегодня
          </Button>
        )}
      </div>

      <Panel
        title="Уровень дня"
        icon="sword"
        accent="var(--c-task)"
        actions={
          <>
            {/* Создание задачи в окне — отдельная кнопка, не связанная со строкой быстрого ввода ниже */}
            <Button small variant="primary" icon="plus" onClick={() => openEditor({ kind: 'new', date })}>
              Новая задача
            </Button>
            {pendingTasks > 0 && (
            <Button
              small
              icon="skip"
              onClick={() =>
                // При фильтре переносим только то, что видно на экране
                void moveUnfinishedToTomorrow(date, filtering ? new Set(visible.flatMap((x) => (x.kind === 'task' ? [x.task.id] : []))) : undefined).then((n) =>
                  toast(`Перенесено на завтра: ${n}`, 'skip', 'var(--c-task)'),
                )
              }
            >
              {filtering ? 'Выбранные на завтра' : 'Перенести на завтра'}
            </Button>
            )}
          </>
        }
      >
        {visible.length > 0 && (
          <div className={s.progressRow}>
            <span>
              {doneCount}/{visible.length}
            </span>
            <div>
              <ProgressBar value={doneCount / visible.length} color="var(--c-task)" label="Выполнено за день" />
            </div>
          </div>
        )}
        <TagBar available={dayTags} selected={tagFilter} onToggle={toggleTag} onClear={clearTags} />
        {data && items.length > 0 && visible.length === 0 && (
          <p style={{ color: 'var(--c-text-dim)', textAlign: 'center', padding: '16px 0' }}>На этот день задач с выбранными метками нет.</p>
        )}
        {data && items.length === 0 && (
          <div className="empty" style={{ textAlign: 'center', color: 'var(--c-text-dim)', padding: '24px 0' }}>
            <PixelIcon name="flag" size={48} />
            <p>Уровень пуст. Нажмите N, чтобы добавить задачу.</p>
          </div>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={visible.map(itemId)} strategy={verticalListSortingStrategy}>
            <ul className={s.list} aria-label="Задачи дня">
              {visible.map((it) =>
                it.kind === 'task' ? (
                  <TaskItem
                    key={it.task.id}
                    id={it.task.id}
                    item={it}
                    onToggle={(d) => void toggleTask(it.task, d)}
                    onToggleItem={(itemId) => void toggleChecklistItem(it.task, itemId)}
                    onTagClick={toggleTag}
                    activeTags={tagFilter}
                    dragDisabled={filtering}
                    onEdit={() => openEditor({ kind: 'task', task: it.task })}
                    onExtra={it.task.done ? undefined : () => void scheduleTask(it.task, null).then(() => toast('Убрано в инвентарь', 'bag', 'var(--c-backlog)'))}
                    extraIcon="bag"
                    extraLabel="Убрать в инвентарь"
                  />
                ) : (
                  <TaskItem
                    key={it.occ.key}
                    id={it.occ.key}
                    item={it}
                    onToggle={(d) => void toggleOccurrence(it.occ, d)}
                    onToggleItem={(itemId) => void toggleOccurrenceChecklistItem(it.occ, itemId)}
                    onTagClick={toggleTag}
                    activeTags={tagFilter}
                    dragDisabled={filtering}
                    onEdit={() => openEditor({ kind: 'occurrence', occ: it.occ })}
                  />
                ),
              )}
            </ul>
          </SortableContext>
        </DndContext>

        <div className={s.addRow}>
          <QuickAdd date={date} todayDate={todayDate} />
        </div>
      </Panel>

      {calendarOpen && (
        <CalendarPicker open value={date} todayDate={todayDate} onPick={setDate} onClose={() => setCalendarOpen(false)} />
      )}
    </>
  );
}
