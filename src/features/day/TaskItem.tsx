import type { CSSProperties } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import s from './Day.module.css';
import { Button, Checkbox, PixelIcon, cx } from '../../ui';
import type { DayItem } from '../../services/tasks';
import { PRIORITY_COLOR, PRIORITY_LABEL, PRIORITY_SHORT } from './labels';

interface Props {
  item: DayItem;
  id: string;
  onToggle: (done: boolean) => void;
  onEdit: () => void;
  onExtra?: (() => void) | undefined;
  extraLabel?: string;
  extraIcon?: 'skip' | 'bag';
}

export function TaskItem({ item, id, onToggle, onEdit, onExtra, extraLabel, extraIcon }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const data =
    item.kind === 'task'
      ? { title: item.task.title, time: item.task.time, priority: item.task.priority, done: item.task.done, reminder: item.task.reminder, tags: item.task.tags, missed: false, skipped: false, postponed: item.task.postponedCount }
      : { title: item.occ.title, time: item.occ.time, priority: item.occ.priority, done: item.occ.status === 'done', reminder: item.occ.reminder, tags: item.occ.tags, missed: item.occ.status === 'missed', skipped: item.occ.status === 'skipped', postponed: 0 };

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    '--prio': PRIORITY_COLOR[data.priority],
  } as CSSProperties;

  return (
    <li ref={setNodeRef} style={style} className={cx(s.item, data.done && s.done, data.missed && s.missed, isDragging && s.dragging)}>
      <button className={s.grip} {...attributes} {...listeners} aria-label={`Переместить «${data.title}»`}>
        <PixelIcon name="grip" size={16} />
      </button>
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
          {data.reminder && (
            <span title="Напоминание">
              <PixelIcon name="bell" size={16} />
              {data.reminder.offsetMin ? `−${data.reminder.offsetMin}м` : ''}
            </span>
          )}
          {data.missed && <span style={{ color: 'var(--c-warn)' }}>пропущено</span>}
          {data.skipped && <span>пропущено вручную</span>}
          {data.postponed > 0 && <span title="Сколько раз переносилась">⏩×{data.postponed}</span>}
          {data.tags.map((t) => (
            <span key={t} style={{ color: 'var(--c-backlog)' }}>
              #{t}
            </span>
          ))}
        </span>
      </button>
      {data.time && <span className={s.time}>{data.time}</span>}
      {onExtra && extraIcon && (
        <div className={s.actions}>
          <Button variant="ghost" small icon={extraIcon} label={extraLabel} onClick={onExtra} />
        </div>
      )}
    </li>
  );
}
