/* Форма дня программы: создание (в том числе из прошедшей тренировки) и правка. */
import { useState } from 'react';
import { Button, Field, Modal, MultiToggle, TextInput, toast } from '../../../core/ui';
import { WEEKDAYS_SHORT } from '../../../core/domain/dates';
import type { Weekday } from '../../../core/domain/types';
import { parseValue } from '../../../core/domain/numbers';
import { useExercises } from '../data/exercises';
import type { Program, ProgramItem, Tracking } from '../domain/types';
import { cleanItem, defaultItem, durationInput, parseDuration } from '../domain/tracking';
import { daysLabel } from '../domain/logic';
import { saveProgram } from '../services/programs';
import { ExercisePicker } from './ExercisePicker';
import s from './Gym.module.css';

const WEEKDAYS = WEEKDAYS_SHORT.map((label, i) => ({ value: i as Weekday, label }));
const ALL_DAYS = WEEKDAYS.map((d) => d.value);

/** Число из поля; пусто или не число — undefined. */
const numOf = (t: string) => parseValue(t) ?? undefined;

/** Цели пункта программы — только те поля, что нужны этому типу упражнения. */
function Targets({ item, tracking, onChange }: { item: ProgramItem; tracking: Tracking; onChange: (p: Partial<ProgramItem>) => void }) {
  const sets = (
    <TextInput
      label="Подходы"
      inputMode="numeric"
      defaultValue={String(item.sets)}
      // Число проверяем, когда поле теряет фокус: иначе его нельзя стереть, чтобы вписать другое
      onBlur={(e) => {
        const n = Number.parseInt(e.target.value, 10);
        const v = Number.isNaN(n) ? item.sets : Math.max(1, Math.min(20, n));
        e.target.value = String(v);
        onChange({ sets: v });
      }}
    />
  );
  const reps = <TextInput label="Повторы" value={item.reps ?? ''} placeholder="8–12" maxLength={10} onChange={(e) => onChange({ reps: e.target.value || undefined })} />;
  const rest = <TextInput label="Отдых, с" inputMode="numeric" defaultValue={item.restSec ?? ''} placeholder="авто" onBlur={(e) => onChange({ restSec: numOf(e.target.value) })} />;
  const time = (label: string, plain: 'sec' | 'min', placeholder: string) => (
    <TextInput
      label={label}
      inputMode="decimal"
      defaultValue={item.durationSec ? durationInput(item.durationSec, plain) : ''}
      placeholder={placeholder}
      onBlur={(e) => {
        const v = parseDuration(e.target.value, plain);
        if (v !== null) e.target.value = durationInput(v, plain);
        onChange({ durationSec: v ?? undefined });
      }}
    />
  );
  const fields =
    tracking === 'weight_reps'
      ? [sets, reps, <TextInput key="w" label="Вес, кг" inputMode="decimal" defaultValue={item.weight ?? ''} onBlur={(e) => onChange({ weight: numOf(e.target.value) })} />, rest]
      : tracking === 'reps'
        ? [sets, reps, rest]
        : tracking === 'time'
          ? [sets, time('Время, сек', 'sec', '60'), rest]
          : [
              sets,
              <TextInput
                key="km"
                label="Дистанция, км"
                inputMode="decimal"
                defaultValue={item.distanceM ? String(item.distanceM / 1000) : ''}
                onBlur={(e) => {
                  const v = numOf(e.target.value);
                  onChange({ distanceM: v ? Math.round(v * 1000) : undefined });
                }}
              />,
              time('Время, мин', 'min', '30'),
            ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${String(fields.length)}, minmax(0, 1fr))`, gap: 8 }}>
      {fields.map((f, k) => (
        <div key={k}>{f}</div>
      ))}
    </div>
  );
}

/** `draft` — упражнения для нового дня (например, из только что проведённой тренировки). */
export function ProgramEditor({ program, draft, onClose }: { program?: Program; draft?: ProgramItem[]; onClose: () => void }) {
  const ex = useExercises();
  const [name, setName] = useState(program?.name ?? '');
  const [items, setItems] = useState<ProgramItem[]>(program?.items ?? draft ?? []);
  const [days, setDays] = useState<Weekday[]>(program?.days ?? []);
  const [picking, setPicking] = useState(false);
  const patch = (i: number, p: Partial<ProgramItem>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) =>
    setItems((xs) => {
      const a = xs[i];
      const b = xs[i + d];
      if (!a || !b) return xs;
      const next = [...xs];
      next[i] = b;
      next[i + d] = a;
      return next;
    });

  const save = async () => {
    if (!name.trim()) {
      toast('Назовите день программы', 'alert', 'var(--c-warn)');
      return;
    }
    // У каждого пункта — только цели, подходящие типу упражнения (тип своего упражнения могли сменить)
    const clean = items.map((it) => cleanItem(it, ex?.byId(it.exerciseId)?.tracking ?? 'weight_reps'));
    await saveProgram({ ...(program ? { id: program.id, order: program.order } : {}), name: name.trim(), items: clean, days: [...days].sort((a, b) => a - b) });
    onClose();
  };

  return (
    <Modal keepOnOutsideClick open onClose={onClose} title={program ? 'День программы' : 'Новый день программы'} accent="var(--c-gym)" footer={
      <>
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="primary" onClick={() => void save()}>Сохранить</Button>
      </>
    }>
      <TextInput label="Название" value={name} maxLength={60} placeholder="Например: Грудь и трицепс" onChange={(e) => setName(e.target.value)} data-autofocus />
      <Field label="Дни недели">
        <MultiToggle values={days} options={WEEKDAYS} onChange={setDays} label="Дни недели" />
      </Field>
      <div className={s.row} style={{ minHeight: 0, marginBottom: 8 }}>
        <Button small onClick={() => setDays(ALL_DAYS)}>
          Каждый день
        </Button>
        <Button small variant="ghost" onClick={() => setDays([])}>
          Без расписания
        </Button>
      </div>
      <p className={s.hint}>{days.length ? `По расписанию: ${daysLabel(days)}` : 'Без расписания — день не появится на «Сводке», но его можно начать вручную.'}</p>
      <ul className={s.list} style={{ margin: '8px 0' }}>
        {items.map((it, i) => (
          <li key={`${it.exerciseId}-${String(i)}`} style={{ borderBottom: 'var(--px) solid var(--c-border)', paddingBottom: 8 }}>
            <div className={s.row}>
              <span className={s.grow}>{ex?.byId(it.exerciseId)?.name ?? it.exerciseId}</span>
              <Button small variant="ghost" icon="up" label="Выше" disabled={i === 0} onClick={() => move(i, -1)} />
              <Button small variant="ghost" icon="down" label="Ниже" disabled={i === items.length - 1} onClick={() => move(i, 1)} />
              <Button small variant="ghost" icon="close" label="Убрать" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} />
            </div>
            {/* Набор полей зависит от типа: при смене типа поля пересоздаются, а не наследуют чужие значения */}
            {ex && <Targets key={ex.byId(it.exerciseId)?.tracking ?? 'weight_reps'} item={it} tracking={ex.byId(it.exerciseId)?.tracking ?? 'weight_reps'} onChange={(p) => patch(i, p)} />}
          </li>
        ))}
      </ul>
      <Button icon="plus" onClick={() => setPicking(true)}>
        Упражнение
      </Button>
      <ExercisePicker open={picking} onClose={() => setPicking(false)} onPick={(exerciseId) => setItems((xs) => [...xs, defaultItem(exerciseId, ex?.byId(exerciseId)?.tracking ?? 'weight_reps')])} />
    </Modal>
  );
}
