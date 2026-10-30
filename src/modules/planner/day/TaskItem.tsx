import type { CSSProperties } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import s from './Day.module.css';
import { Button, Checkbox, PixelIcon, cx } from '../../../core/ui';
import type { DayItem } from '../services/tasks';
import { PRIORITY_COLOR, PRIORITY_LABEL, PRIORITY_SHORT } from './labels';
import { checklistProgress } from '../domain/checklist';
import { normalizeTag } from '../domain/tags';
import { reminderLabel, remindersOf } from '../domain/reminderSpecs';
import { collapseKey, useCollapsed } from '../../../core/stores/collapsed';

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
}

export function TaskItem({ item, id, onToggle, onEdit, onExtra, extraLabel, extraIcon, onToggleItem, onTagClick, activeTags = [], dragDisabled = false }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: dragDisabled });
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

  return (
    <li ref={setNodeRef} style={style} className={cx(s.item, data.done && s.done, data.missed && s.missed, isDragging && s.dragging)}>
      {dragDisabled ? (
        <span className={s.grip} aria-hidden style={{ cursor: 'default', opacity: 0.25 }}>
          <PixelIcon name="grip" size={16} />
        </span>
      ) : (
        <button className={s.grip} {...attributes} {...listeners} aria-label={`Переместить «${data.title}»`}>
          <PixelIcon name="grip" size={16} />
        </button>
      )}
      <Checkbox
        checked={data.done}
        onChange={onToggle}
        label={`Выполнено: ${data.title}`}
        color={item.kind === 'occ' ? 'var(--c-task)' : undefined}
      />
      <button className={s.body} onClick={onEdit} aria-label={`Редактировать «${data.title}»`}>
        <span className={s.title}>{data.title}</span>
        <span className={s.meta}>
          <span className={s.badge} style={{ color: PRIORITY_COLOR[data.priority] }} title={`Приоритет: ${PRIORITY_LABEL[data.priority]}`}>
            {PRIORITY_SHORT[data.priority]}
          </span>
          {item.kind === 'occ' && (
            <span title="Повторяющаяся">
              <PixelIcon name="repeat" size={16} /> повтор
            </span>
          )}
          {data.reminders.length > 0 && (
            <span title={`Напоминания: ${data.reminders.map((r) => reminderLabel(r.offsetMin).toLowerCase()).join(', ')}`}>
              <PixelIcon name="bell" size={16} />
              {data.reminders.length > 1 ? `×${String(data.reminders.length)}` : data.reminders[0]?.offsetMin ? `−${String(data.reminders[0].offsetMin)}м` : ''}
            </span>
          )}
          {data.missed && <span style={{ color: 'var(--c-warn)' }}>пропущено</span>}
          {data.skipped && <span>пропущено вручную</span>}
          {data.postponed > 0 && <span title="Сколько раз переносилась">⏩×{data.postponed}</span>}
        </span>
      </button>
      {data.time && <span className={s.time}>{data.time}</span>}
      {onExtra && extraIcon && (
        <div className={s.actions}>
          <Button variant="ghost" small icon={extraIcon} label={extraLabel} onClick={onExtra} />
        </div>
      )}
      {data.tags.length > 0 && (
        <div className={s.clWrap}>
          <div className={s.tagRow} role="group" aria-label="Метки">
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
          </div>
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
    </li>
  );
}
