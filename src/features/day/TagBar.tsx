import { Link } from 'react-router';
import s from './TagBar.module.css';
import { Button } from '../../ui';
import type { TagCount } from '../../domain/tags';

interface Props {
  /** Метки дня со счётчиком. */
  available: readonly TagCount[];
  /** Выбранные метки — показываем всегда, даже если в этот день задач с ними нет (чтобы можно было сбросить). */
  selected: readonly string[];
  onToggle: (tag: string) => void;
  onClear: () => void;
}

/** Панель меток над списком дня: нажатие сужает список, «Все дни» открывает страницу метки. */
export function TagBar({ available, selected, onToggle, onClear }: Props) {
  const chips: TagCount[] = [...available];
  for (const t of selected) if (!chips.some((c) => c.tag === t)) chips.push({ tag: t, count: 0 });
  if (chips.length === 0) return null;
  const only = selected.length === 1 ? selected[0] : undefined;

  return (
    <div className={s.bar} role="group" aria-label="Фильтр по меткам">
      <span className={s.label}>МЕТКИ</span>
      {chips.map(({ tag, count }) => (
        <button key={tag} type="button" className={s.tag} aria-pressed={selected.includes(tag)} onClick={() => onToggle(tag)}>
          #{tag}
          <span className={s.count}>{count}</span>
        </button>
      ))}
      {selected.length > 0 && (
        <Button small variant="ghost" icon="close" onClick={onClear}>
          Сбросить
        </Button>
      )}
      {only && (
        <Link className={s.link} to={`/tag/${encodeURIComponent(only)}`}>
          Все дни и инвентарь →
        </Link>
      )}
    </div>
  );
}
