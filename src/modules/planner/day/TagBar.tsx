import { Link } from 'react-router';
import s from './TagBar.module.css';
import type { TagCount } from '../domain/tags';

interface Props {
  /** Метки дня со счётчиком. */
  available: readonly TagCount[];
  /** Сколько всего задач в дне — для пункта «Все». */
  total: number;
  /** Выбранные метки — показываем всегда, даже если в этот день задач с ними нет (чтобы можно было сбросить). */
  selected: readonly string[];
  onToggle: (tag: string) => void;
  onClear: () => void;
}

/** Метки над списком дня — одна строка с прокруткой вбок. «Все» сбрасывает фильтр, «Все дни» открывает страницу метки. */
export function TagBar({ available, total, selected, onToggle, onClear }: Props) {
  const chips: TagCount[] = [...available];
  for (const t of selected) if (!chips.some((c) => c.tag === t)) chips.push({ tag: t, count: 0 });
  if (chips.length === 0) return null;
  const only = selected.length === 1 ? selected[0] : undefined;

  return (
    <div className={s.wrap}>
      <div className={s.bar} role="group" aria-label="Фильтр по меткам">
        <button
          type="button"
          className={s.tag}
          aria-pressed={selected.length === 0}
          onClick={onClear}
        >
          Все
          <span className={s.count}>{total}</span>
        </button>
        {chips.map(({ tag, count }) => (
          <button
            key={tag}
            type="button"
            className={s.tag}
            aria-pressed={selected.includes(tag)}
            onClick={() => onToggle(tag)}
          >
            #{tag}
            <span className={s.count}>{count}</span>
          </button>
        ))}
      </div>
      {/* Под строкой меток, а не в её конце: в прокрутке вбок ссылку не видно */}
      {only && (
        <Link className={s.link} to={`/tag/${encodeURIComponent(only)}`}>
          #{only}: все дни и бэклог →
        </Link>
      )}
    </div>
  );
}
