import { useMemo, useRef, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import s from './Day.module.css';
import { Button, ConfirmDialog, Menu, PixelIcon, toast, type MenuItem } from '../../../core/ui';
import { EditScopeDialog } from '../recurring/EditScopeDialog';
import { TopbarActions } from '../../../core/shell/TopbarActions';
import { useUi } from '../stores/ui';
import { useToday } from '../../../core/shell/useToday';
import { useHotkeys } from '../../../core/shell/hotkeys';
import { useDockHeight } from '../../../core/shell/useDockHeight';
import { useDay } from '../data/hooks';
import { diffDays, formatDateDay } from '../../../core/domain/dates';
import { hasAllTags, tagCounts } from '../domain/tags';
import { ProgressBar } from '../../../core/charts/ProgressBar';
import {
  deleteOccurrence,
  deleteTask,
  moveUnfinishedToTomorrow,
  reorderDay,
  scheduleTask,
  toggleChecklistItem,
  toggleOccurrence,
  toggleOccurrenceChecklistItem,
  toggleTask,
  type DayItem,
} from '../services/tasks';
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
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'завтра';
  if (diff === -1) return 'вчера';
  return diff > 0 ? `через ${diff} дн.` : `${-diff} дн. назад`;
}

export function DayScreen() {
  const todayDate = useToday();
  const { date, shiftDate, setDate, goToday, openEditor, calendarOpen, setCalendarOpen, tagFilter, toggleTag, clearTags } = useUi();
  const data = useDay(date, todayDate);
  // Что удаляем смахиванием: ждёт подтверждения
  const [askDelete, setAskDelete] = useState<DayItem | null>(null);

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
  const dockRef = useRef<HTMLDivElement>(null);
  useDockHeight(dockRef);
  const [prevSorted, setPrevSorted] = useState(sorted);
  if (prevSorted !== sorted) {
    setPrevSorted(sorted);
    setItems(sorted);
  }

  // Мышью — за ручку, пальцем — долгим нажатием на задачу (ручки на телефоне нет)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
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

  const moveToTomorrow = () =>
    // При фильтре переносим только то, что видно на экране
    void moveUnfinishedToTomorrow(date, filtering ? new Set(visible.flatMap((x) => (x.kind === 'task' ? [x.task.id] : []))) : undefined).then((n) =>
      toast(`Перенесено на завтра: ${n}`, 'skip', 'var(--c-task)'),
    );
  const menu: MenuItem[] = [
    { label: 'Новая задача с подробностями', icon: 'plus', onSelect: () => openEditor({ kind: 'new', date }) },
    ...(pendingTasks > 0
      ? [{ label: filtering ? 'Выбранные — на завтра' : 'Перенести несделанное на завтра', icon: 'skip' as const, onSelect: moveToTomorrow }]
      : []),
  ];
  const left = visible.length - doneCount;

  return (
    <>
      <div className={s.header}>
        <Button icon="left" label="Предыдущий день (←)" onClick={() => shiftDate(-1)} />
        <div className={s.dateBlock}>
          <h1 className={s.dateTitle}>{formatDateDay(date)}</h1>
          {diff === 0 ? (
            <div className={s.stage}>{relativeLabel(diff)}</div>
          ) : (
            <button type="button" className={s.stageLink} onClick={goToday} title="Вернуться к сегодня (T)">
              {relativeLabel(diff)} · к сегодня
            </button>
          )}
        </div>
        <Button icon="right" label="Следующий день (→)" onClick={() => shiftDate(1)} />
        <TopbarActions>
          <div className={s.tools}>
            <Button variant="ghost" icon="calendar" label="Календарь" onClick={() => setCalendarOpen(true)} />
            <Menu label="Действия с днём" items={menu} />
          </div>
        </TopbarActions>
      </div>

      {visible.length > 0 && (
        <div className={s.progressRow}>
          <span>
            {doneCount} из {visible.length}
          </span>
          <div>
            <ProgressBar value={doneCount / visible.length} color="var(--c-task)" label="Выполнено за день" />
          </div>
          <span>{left > 0 ? `осталось ${left}` : 'всё сделано'}</span>
        </div>
      )}
      <TagBar available={dayTags} total={items.length} selected={tagFilter} onToggle={toggleTag} onClear={clearTags} />
      {data && items.length > 0 && visible.length === 0 && (
        <p style={{ color: 'var(--c-text-dim)', textAlign: 'center', padding: '16px 0' }}>На этот день задач с выбранными метками нет.</p>
      )}
      {data && items.length === 0 && (
        <div className="empty" style={{ textAlign: 'center', color: 'var(--c-text-dim)', padding: '32px 0' }}>
          <PixelIcon name="flag" size={48} />
          <p>
            На этот день задач нет.
            <br />
            <span className={s.hintKeys}>Нажмите N или напишите задачу в поле внизу.</span>
            <span className={s.hintTouch}>Напишите задачу в поле внизу.</span>
          </p>
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
                  onSwipeDelete={() => setAskDelete(it)}
                  onEdit={() => openEditor({ kind: 'task', task: it.task })}
                  onExtra={it.task.done ? undefined : () => void scheduleTask(it.task, null).then(() => toast('Убрано в бэклог', 'bag', 'var(--c-backlog)'))}
                  extraIcon="bag"
                  extraLabel="Убрать в бэклог"
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
                  onSwipeDelete={() => setAskDelete(it)}
                  onEdit={() => openEditor({ kind: 'occurrence', occ: it.occ })}
                />
              ),
            )}
          </ul>
        </SortableContext>
      </DndContext>

      {/* Быстрый ввод закреплён внизу экрана поверх содержимого; пустой блок ниже резервирует место под последней задачей */}
      <div className={s.dock} ref={dockRef}>
        <div className={s.dockInner}>
          <div className={s.dockBox}>
            <QuickAdd date={date} todayDate={todayDate} />
          </div>
        </div>
      </div>
      <div style={{ height: 'var(--dock-h, 0px)' }} aria-hidden />

      <ConfirmDialog
        open={askDelete?.kind === 'task'}
        title="Удалить задачу?"
        onClose={() => setAskDelete(null)}
        onConfirm={() => {
          if (askDelete?.kind === 'task') void deleteTask(askDelete.task.id).then(() => toast('Удалено', 'trash', 'var(--c-warn)'));
        }}
      >
        {askDelete?.kind === 'task' ? `«${askDelete.task.title}» будет удалена.` : ''}
      </ConfirmDialog>
      <EditScopeDialog
        open={askDelete?.kind === 'occ'}
        action="delete"
        onClose={() => setAskDelete(null)}
        onPick={(scope) => {
          const it = askDelete;
          setAskDelete(null);
          if (it?.kind === 'occ') void deleteOccurrence(it.occ, scope).then(() => toast('Удалено', 'trash', 'var(--c-warn)'));
        }}
      />
      {calendarOpen && (
        <CalendarPicker open value={date} todayDate={todayDate} onPick={setDate} onClose={() => setCalendarOpen(false)} />
      )}
    </>
  );
}
