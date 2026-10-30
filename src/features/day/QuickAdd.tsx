import { useMemo, useRef, useState, type CSSProperties } from 'react';
import s from './QuickAdd.module.css';
import { Button, PixelIcon, toast, cx } from '../../ui';
import { createTask } from '../../services/tasks';
import { parseQuickAdd, type QuickKind } from '../../domain/quickAdd';
import { describeRule } from '../../domain/recurrence';
import { formatDateLong } from '../../domain/dates';
import type { LocalDate } from '../../domain/types';
import { PRIORITY_COLOR, PRIORITY_LABEL } from './labels';

interface Props {
  /** День, открытый на экране: сюда попадёт задача, если в тексте нет другой даты. */
  date: LocalDate;
  /** Настоящее «сегодня» — от него считаются «завтра», «в пятницу» и т.п. */
  todayDate: LocalDate;
}

// Подсказка с примером — прямо в поле: на телефоне она просто обрежется, на компьютере видна целиком
const PLACEHOLDER = 'Что сделать? Например: завтра в 15:00 позвонить маме #семья !';

/** Быстрый ввод: разбирает дату, время, приоритет, метки, повтор и напоминание прямо из текста. */
export function QuickAdd({ date, todayDate }: Props) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [ignored, setIgnored] = useState<ReadonlySet<QuickKind>>(new Set());

  // Без отключений — чтобы показать и те части, которые пользователь отключил (их можно вернуть)
  const full = useMemo(() => parseQuickAdd(text, todayDate), [text, todayDate]);
  const parsed = useMemo(() => parseQuickAdd(text, todayDate, ignored), [text, todayDate, ignored]);

  const toggle = (k: QuickKind) =>
    setIgnored((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const submit = async () => {
    if (text.trim() === '') return;
    // Фокус остаётся в поле, даже если нажали кнопку: можно сразу вводить следующую задачу,
    // а на телефоне клавиатура не закрывается
    inputRef.current?.focus();
    // Поле очищаем сразу, до записи в базу: пока она идёт (на телефоне — заметное время),
    // пользователь уже может печатать следующую задачу, и тексты не должны склеиться.
    const sent = { text, ignored };
    const p = parsed;
    setText('');
    setIgnored(new Set());
    const target = p.date ?? date;
    try {
      await createTask({
        title: p.title,
        date: target,
        priority: p.priority ?? 'medium',
        tags: p.tags,
        ...(p.time ? { time: p.time } : {}),
        // Время без явного «напомни за…» — напоминание в момент начала
        ...(p.reminder !== undefined || p.time ? { reminders: [{ offsetMin: p.reminder ?? 0 }] } : {}),
        ...(p.repeat ? { repeat: p.repeat } : {}),
      });
    } catch {
      // Не удалось сохранить — возвращаем текст, если поле ещё пустое
      setText((cur) => (cur === '' ? sent.text : cur));
      setIgnored(sent.ignored);
      toast('Не удалось добавить задачу', 'alert', 'var(--c-warn)');
      return;
    }
    if (p.repeat) toast(`Повтор создан: ${describeRule({ ...p.repeat.pattern, start: target, end: p.repeat.end })}`, 'repeat', 'var(--c-task)');
    else if (target !== date) toast(`Добавлено: ${formatDateLong(target)}`, 'calendar', 'var(--c-task)');
  };

  const chip = (kind: QuickKind, icon: 'calendar' | 'clock' | 'bell' | 'repeat' | 'flag', label: string, color?: string) => {
    const off = ignored.has(kind);
    return (
      <button
        key={kind}
        type="button"
        className={cx(s.chip, off && s.off)}
        style={color ? ({ '--chip': color } as CSSProperties) : undefined}
        aria-pressed={!off}
        title={off ? 'Вернуть распознавание' : 'Не распознавать: оставить в названии как есть'}
        onClick={() => toggle(kind)}
      >
        <PixelIcon name={icon} size={16} />
        {label}
      </button>
    );
  };

  const hasFound = full.found.length > 0 || full.tags.length > 0;

  return (
    <div className={s.wrap}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label htmlFor="quick-add" className="sr-only">
          Быстрый ввод задачи
        </label>
        {/* Кнопка «Добавить» — рядом с полем, а на узком экране под ним: она отправляет написанное, а не открывает окно */}
        <div className={s.row}>
          <div className={s.field}>
            <input
              ref={inputRef}
              id="quick-add"
              className={s.input}
              placeholder={PLACEHOLDER}
              autoComplete="off"
              enterKeyHint="send"
              aria-describedby={text.trim() === '' ? undefined : 'quick-add-hint'}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <Button type="submit" variant="primary" icon="right" className={s.send} disabled={text.trim() === ''}>
            Добавить
          </Button>
        </div>
      </form>
      {text.trim() === '' ? null : (
        <div id="quick-add-hint" className={s.chips} aria-live="polite">
          {hasFound ? <span className={s.note}>Распознано:</span> : null}
          {full.found.includes('date') && full.date && chip('date', 'calendar', formatDateLong(full.date))}
          {full.found.includes('time') && full.time && chip('time', 'clock', full.time)}
          {full.found.includes('reminder') && full.reminder !== undefined && chip('reminder', 'bell', `за ${full.reminder === 60 ? '1 ч' : `${String(full.reminder)} мин`}`)}
          {full.found.includes('repeat') && full.repeat && chip('repeat', 'repeat', describeRule({ ...full.repeat.pattern, start: full.date ?? date, end: full.repeat.end }))}
          {full.found.includes('priority') && full.priority && chip('priority', 'flag', PRIORITY_LABEL[full.priority], PRIORITY_COLOR[full.priority])}
          {parsed.tags.map((t) => (
            <span key={t} className={cx(s.chip, s.tag)}>
              #{t}
            </span>
          ))}
          {!hasFound && <span className={s.note}>Enter — добавить задачу «{text.trim()}»</span>}
        </div>
      )}
    </div>
  );
}
