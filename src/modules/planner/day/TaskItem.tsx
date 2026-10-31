import type { CSSProperties, ReactNode, TouchEvent } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import s from './Day.module.css';
import { Button, Checkbox, PixelIcon, cx } from '../../../core/ui';
import type { DayItem } from '../services/tasks';
import { PRIORITY_COLOR, PRIORITY_LABEL } from './labels';
import { checklistProgress } from '../domain/checklist';
import { normalizeTag } from '../domain/tags';
import { reminderLabel, reminderShort, remindersOf } from '../domain/reminderSpecs';
import { collapseKey, useCollapsed } from '../../../core/stores/collapsed';
import { useSwipe } from './useSwipe';

interface Props {
  item: DayItem;
  id: string;
  onToggle: (done: boolean) => void;
  onEdit: () => void;
  onExtra?: (() => void) | undefined;
  extraLabel?: string;
  extraIcon?: 'skip' | 'bag';
  /** Отметить / снять пункт чек-листа. */
  onToggleItem?: ((itemId: string) => void) | undefined;
  /** Нажатие на метку: фильтр по ней. */
  onTagClick?: ((tag: string) => void) | undefined;
  /** Выбранные метки-фильтры (подсвечиваем). */
  activeTags?: readonly string[] | undefined;
  /** Перетаскивание отключено (например, при фильтре по метке: порядок скрытых задач не должен сбиться). */
  dragDisabled?: boolean | undefined;
  /** Смахивание влево: вызывается, когда строку потянули дальше порога (подтверждение — на вызывающем). */
  onSwipeDelete?: (() => void) | undefined;
  /** Смахивание вправо (например, «на сегодня»): подпись и действие. */
  swipeRight?: { label: string; icon: 'sun' | 'check'; onSwipe: () => void } | undefined;
  /** Скрыть ручку перетаскивания (список без ручной сортировки). */
  noGrip?: boolean | undefined;
  /** Дополнительная строка действий под названием. */
  footer?: ReactNode;
}

export function TaskItem({ item, id, onToggle, onEdit, onExtra, extraLabel, extraIcon, onToggleItem, onTagClick, activeTags = [], dragDisabled = false, onSwipeDelete, swipeRight, noGrip = false, footer }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: dragDisabled });
  // Пальцем задачу тащат долгим нажатием на любое место строки, мышью и с клавиатуры — за ручку
  const { onTouchStart, ...gripListeners } = (listeners ?? {}) as Record<string, ((e: TouchEvent) => void) | undefined>;
  const data =
    item.kind === 'task'
      ? { title: item.task.title, time: item.task.time, priority: item.task.priority, done: item.task.done, reminders: remindersOf(item.task), notes: item.task.notes, checklist: item.task.checklist, tags: item.task.tags, missed: false, skipped: false, postponed: item.task.postponedCount }
      : { title: item.occ.title, time: item.occ.time, priority: item.occ.priority, done: item.occ.status === 'done', reminders: item.occ.reminders, notes: item.occ.notes, checklist: item.occ.checklist, tags: item.occ.tags, missed: item.occ.status === 'missed', skipped: item.occ.status === 'skipped', postponed: 0 };

  // Свёрнутость запоминается на устройстве; у повторов — одна на всю серию, а не на каждый день
  const collapseId = item.kind === 'task' ? item.task.id : item.occ.seriesId;
  const notesKey = collapseKey.taskNotes(collapseId);
  const listKey = collapseKey.taskList(collapseId);
  const notesOpen = useCollapsed((st) => st.collapsed[notesKey] !== true);
  const listOpen = useCollapsed((st) => st.collapsed[listKey] !== true);
  const toggleCollapsed = useCollapsed((st) => st.toggle);

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    '--prio': PRIORITY_COLOR[data.priority],
  } as CSSProperties;

  const swipe = useSwipe({ onLeft: onSwipeDelete, onRight: swipeRight?.onSwipe });
  const hasMeta = Boolean(data.time) || data.tags.length > 0 || item.kind === 'occ' || data.reminders.length > 0 || data.missed || data.skipped || data.postponed > 0;

  return (
    <li ref={setNodeRef} style={style} className={cx(s.row, isDragging && s.dragging)} onTouchStart={dragDisabled ? undefined : onTouchStart}>
      {onSwipeDelete && (
        <div className={cx(s.swipeBg, swipe.dx < 0 && s.swipeOn, swipe.pastThreshold && s.swipeReady)} aria-hidden>
          <PixelIcon name="trash" size={20} />
          Удалить
        </div>
      )}
      {swipeRight && (
        <div className={cx(s.swipeBg, s.swipeLeftSide, swipe.dx > 0 && s.swipeOn, swipe.pastThreshold && s.swipeReadyOk)} aria-hidden>
          <PixelIcon name={swipeRight.icon} size={20} />
          {swipeRight.label}
        </div>
      )}
      <div className={cx(s.item, data.done && s.done, data.missed && s.missed)} style={swipe.rowStyle} {...swipe.bind}>
      {noGrip ? null : dragDisabled ? (
        <span className={s.grip} aria-hidden style={{ cursor: 'default', opacity: 0.25 }}>
          <PixelIcon name="grip" size={16} />
        </span>
      ) : (
        <button className={s.grip} {...attributes} {...gripListeners} aria-label={`Переместить «${data.title}»`}>
          <PixelIcon name="grip" size={16} />
        </button>
      )}
      <Checkbox
        checked={data.done}
        onChange={onToggle}
        label={`Выполнено: ${data.title}`}
        color={item.kind === 'occ' ? 'var(--c-task)' : undefined}
      />
      <div className={s.body}>
        {/* Нажатие на любое место строки, кроме меток, открывает задачу (кнопка растянута на всю строку) */}
        <button type="button" className={s.title} onClick={onEdit} aria-label={`Редактировать «${data.title}»`}>
          {data.title}
        </button>
        {hasMeta && (
          <span className={s.meta}>
            {data.time && <span className={s.time}>{data.time}</span>}
            {data.tags.map((t) => {
              const tag = normalizeTag(t);
              return (
                <button
                  key={t}
                  type="button"
                  className={cx(s.tagChip, activeTags.includes(tag) && s.tagActive)}
                  aria-pressed={activeTags.includes(tag)}
                  title="Показать задачи с этой меткой"
                  disabled={!onTagClick}
                  onClick={() => onTagClick?.(tag)}
                >
                  #{tag}
                </button>
              );
            })}
            {item.kind === 'occ' && (
              <span title="Повторяющаяся">
                <PixelIcon name="repeat" size={12} /> повтор
              </span>
            )}
            {data.reminders.length > 0 && (
              <span title={`Напоминания: ${data.reminders.map((r) => reminderLabel(r.offsetMin).toLowerCase()).join(', ')}`}>
                <PixelIcon name="bell" size={12} />
                {data.reminders.length > 1 ? `×${String(data.reminders.length)}` : reminderShort(data.reminders[0]?.offsetMin ?? 0)}
              </span>
            )}
            {data.missed && <span style={{ color: 'var(--c-warn)' }}>пропущено</span>}
            {data.skipped && <span>пропущено вручную</span>}
            {data.postponed > 0 && <span title="Сколько раз переносилась">⏩×{data.postponed}</span>}
          </span>
        )}
        {/* Приоритет виден по цвету полосы слева; для скринридера — словами */}
        <span className="sr-only">Приоритет: {PRIORITY_LABEL[data.priority]}</span>
        {footer}
      </div>
      {onExtra && extraIcon && (
        <div className={s.actions}>
          <Button variant="ghost" small icon={extraIcon} label={extraLabel} onClick={onExtra} />
        </div>
      )}
      {data.notes && (
        <div className={s.clWrap}>
          <button
            type="button"
            className={s.clToggle}
            aria-expanded={notesOpen}
            aria-label={`Заметки: ${notesOpen ? 'свернуть' : 'развернуть'}`}
            onClick={() => toggleCollapsed(notesKey)}
          >
            {notesOpen ? '▾' : '▸'} Заметки
          </button>
          {notesOpen && <p className={s.noteText}>{data.notes}</p>}
        </div>
      )}
      {data.checklist && data.checklist.length > 0 && (
        <div className={s.clWrap}>
          <button
            type="button"
            className={s.clToggle}
            aria-expanded={listOpen}
            aria-label={`Чек-лист: выполнено ${String(checklistProgress(data.checklist).done)} из ${String(data.checklist.length)}. ${listOpen ? 'Свернуть' : 'Развернуть'}`}
            onClick={() => toggleCollapsed(listKey)}
          >
            {listOpen ? '▾' : '▸'} Чек-лист {checklistProgress(data.checklist).done}/{data.checklist.length}
          </button>
          {listOpen && (
            <ul className={s.checklist} aria-label={`Чек-лист: ${data.title}`}>
              {data.checklist.map((c) => (
                <li key={c.id} className={cx(s.checkItem, c.done && s.itemDone)}>
                  <Checkbox checked={c.done} onChange={() => onToggleItem?.(c.id)} label={c.text} color="var(--c-task)" disabled={!onToggleItem} />
                  <span>{c.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      </div>
    </li>
  );
}
