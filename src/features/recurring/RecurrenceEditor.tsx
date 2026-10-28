import { MultiToggle, SelectInput, TextInput } from '../../ui';
import { WEEKDAYS_SHORT, weekday, parseLocalDate } from '../../domain/dates';
import type { LocalDate, RecurrenceEnd, RecurrencePattern, Weekday } from '../../domain/types';

export interface RepeatValue {
  pattern: RecurrencePattern;
  end: RecurrenceEnd;
}

type Freq = RecurrencePattern['freq'] | 'none';

const FREQ_OPTIONS: { value: Freq; label: string }[] = [
  { value: 'none', label: 'Не повторять' },
  { value: 'daily', label: 'Каждый день' },
  { value: 'weekdays', label: 'По будням' },
  { value: 'weekly', label: 'По дням недели / раз в неделю' },
  { value: 'interval', label: 'Каждые N дней' },
  { value: 'monthly', label: 'Раз в месяц (число)' },
];

const WEEKDAY_OPTIONS = WEEKDAYS_SHORT.map((label, i) => ({ value: i as Weekday, label }));

interface Props {
  value: RepeatValue | undefined;
  onChange: (v: RepeatValue | undefined) => void;
  start: LocalDate;
}

export function RecurrenceEditor({ value, onChange, start }: Props) {
  const freq: Freq = value?.pattern.freq ?? 'none';
  const end = value?.end ?? { type: 'never' };

  const setFreq = (f: Freq) => {
    if (f === 'none') return onChange(undefined);
    const pattern: RecurrencePattern =
      f === 'weekly'
        ? { freq: 'weekly', days: [weekday(start)] }
        : f === 'interval'
          ? { freq: 'interval', everyDays: 2 }
          : f === 'monthly'
            ? { freq: 'monthly', monthDay: parseLocalDate(start).day }
            : { freq: f };
    onChange({ pattern, end });
  };

  return (
    <fieldset style={{ border: '4px solid var(--c-border)', padding: 12, margin: '0 0 12px' }}>
      <legend className="title" style={{ fontSize: 8, padding: '0 6px', color: 'var(--c-text-dim)' }}>
        ПОВТОРЕНИЕ
      </legend>
      <SelectInput label="Как часто" value={freq} options={FREQ_OPTIONS} onChange={(e) => setFreq(e.target.value as Freq)} />
      {value?.pattern.freq === 'weekly' && (
        <div style={{ marginBottom: 12 }}>
          <MultiToggle
            label="Дни недели"
            values={value.pattern.days}
            options={WEEKDAY_OPTIONS}
            onChange={(days) => onChange({ ...value, pattern: { freq: 'weekly', days: days.sort() } })}
          />
          {value.pattern.days.length === 0 && <p style={{ color: 'var(--c-warn)', margin: '6px 0 0' }}>Выберите хотя бы один день</p>}
        </div>
      )}
      {value?.pattern.freq === 'interval' && (
        <TextInput
          label="Каждые N дней"
          type="number"
          min={1}
          max={365}
          value={value.pattern.everyDays}
          onChange={(e) => onChange({ ...value, pattern: { freq: 'interval', everyDays: Math.max(1, Math.min(365, Number(e.target.value) || 1)) } })}
        />
      )}
      {value?.pattern.freq === 'monthly' && (
        <TextInput
          label="Число месяца (31 = последний день)"
          type="number"
          min={1}
          max={31}
          value={value.pattern.monthDay}
          onChange={(e) => onChange({ ...value, pattern: { freq: 'monthly', monthDay: Math.max(1, Math.min(31, Number(e.target.value) || 1)) } })}
        />
      )}
      {value && (
        <>
          <SelectInput
            label="Окончание"
            value={end.type}
            options={[
              { value: 'never', label: 'Никогда' },
              { value: 'until', label: 'До даты' },
              { value: 'count', label: 'После N повторов' },
            ]}
            onChange={(e) => {
              const t = e.target.value;
              onChange({
                ...value,
                end: t === 'until' ? { type: 'until', date: start } : t === 'count' ? { type: 'count', count: 10 } : { type: 'never' },
              });
            }}
          />
          {end.type === 'until' && (
            <TextInput label="Последняя дата" type="date" min={start} value={end.date} onChange={(e) => e.target.value && onChange({ ...value, end: { type: 'until', date: e.target.value } })} />
          )}
          {end.type === 'count' && (
            <TextInput
              label="Количество повторов"
              type="number"
              min={1}
              max={1000}
              value={end.count}
              onChange={(e) => onChange({ ...value, end: { type: 'count', count: Math.max(1, Number(e.target.value) || 1) } })}
            />
          )}
        </>
      )}
    </fieldset>
  );
}
