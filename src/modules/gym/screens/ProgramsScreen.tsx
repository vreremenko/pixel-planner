/* Программа: дни тренировок со списком упражнений и целевыми подходами. */
import { useState } from 'react';
import { Button, ConfirmDialog, Field, Modal, MultiToggle, Panel, TextInput, toast } from '../../../core/ui';
import { WEEKDAYS_SHORT } from '../../../core/domain/dates';
import type { Weekday } from '../../../core/domain/types';
import { parseValue } from '../../../core/domain/numbers';
import { useExercises } from '../data/exercises';
import { usePrograms } from '../data/hooks';
import type { Program, ProgramItem } from '../domain/types';
import { daysLabel } from '../domain/logic';
import { deleteProgram, moveProgram, saveProgram } from '../services/programs';
import { ExercisePicker } from './ExercisePicker';
import s from './Gym.module.css';

const WEEKDAYS = WEEKDAYS_SHORT.map((label, i) => ({ value: i as Weekday, label }));
const ALL_DAYS = WEEKDAYS.map((d) => d.value);

function ProgramEditor({ program, onClose }: { program?: Program; onClose: () => void }) {
  const ex = useExercises();
  const [name, setName] = useState(program?.name ?? '');
  const [items, setItems] = useState<ProgramItem[]>(program?.items ?? []);
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
    await saveProgram({ ...(program ? { id: program.id, order: program.order } : {}), name: name.trim(), items, days: [...days].sort((a, b) => a - b) });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={program ? 'День программы' : 'Новый день программы'} accent="var(--c-gym)" footer={
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
              <TextInput
                label="Подходы"
                inputMode="numeric"
                defaultValue={String(it.sets)}
                // Число проверяем, когда поле теряет фокус: иначе его нельзя стереть, чтобы вписать другое
                onBlur={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  const sets = Number.isNaN(n) ? it.sets : Math.max(1, Math.min(20, n));
                  e.target.value = String(sets);
                  patch(i, { sets });
                }}
              />
              <TextInput label="Повторы" value={it.reps ?? ''} placeholder="8–12" maxLength={10} onChange={(e) => patch(i, { reps: e.target.value || undefined })} />
              <TextInput label="Вес, кг" inputMode="decimal" defaultValue={it.weight ?? ''} onBlur={(e) => patch(i, { weight: parseValue(e.target.value) ?? undefined })} />
              <TextInput label="Отдых, с" inputMode="numeric" defaultValue={it.restSec ?? ''} placeholder="авто" onBlur={(e) => patch(i, { restSec: parseValue(e.target.value) ?? undefined })} />
            </div>
          </li>
        ))}
      </ul>
      <Button icon="plus" onClick={() => setPicking(true)}>
        Упражнение
      </Button>
      <ExercisePicker open={picking} onClose={() => setPicking(false)} onPick={(exerciseId) => setItems((xs) => [...xs, { exerciseId, sets: 3, reps: '8–12' }])} />
    </Modal>
  );
}

export function ProgramsScreen() {
  const programs = usePrograms();
  const ex = useExercises();
  const [editing, setEditing] = useState<Program | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Program | null>(null);
  if (!programs) return null;
  return (
    <>
      <div className={s.head}>
        <h1 className="glow pageTitle" style={{ color: 'var(--c-gym)' }}>
          Программа
        </h1>
        <Button icon="plus" onClick={() => setEditing('new')}>
          День
        </Button>
      </div>
      <div className={s.stack}>
        {programs.length === 0 && (
          <p className={s.dim}>
            Программа — это дни тренировок, например «Грудь», «Спина», «Ноги». Каждому дню можно назначить дни недели — тогда «Сводка» покажет, что сегодня по плану, а вес подставится из прошлого раза.
          </p>
        )}
        {programs.map((p, i) => (
          <Panel
            key={p.id}
            title={`${String(i + 1)}. ${p.name} · ${daysLabel(p.days)}`}
            icon="dumbbell"
            accent="var(--c-gym)"
            actions={
              <>
                <Button small variant="ghost" icon="up" label="Выше" disabled={i === 0} onClick={() => void moveProgram(p.id, -1)} />
                <Button small variant="ghost" icon="down" label="Ниже" disabled={i === programs.length - 1} onClick={() => void moveProgram(p.id, 1)} />
                <Button small icon="edit" label="Изменить" onClick={() => setEditing(p)} />
                <Button small variant="ghost" icon="trash" label="Удалить" onClick={() => setDeleting(p)} />
              </>
            }
          >
            {p.items.length === 0 ? (
              <p className={s.dim} style={{ margin: 0 }}>Пока без упражнений.</p>
            ) : (
              <ul className={s.list}>
                {p.items.map((it, j) => (
                  <li key={`${it.exerciseId}-${String(j)}`} className={s.row} style={{ minHeight: 32 }}>
                    <span className={s.grow}>{ex?.byId(it.exerciseId)?.name ?? it.exerciseId}</span>
                    <span className={s.dim}>
                      {it.sets} × {it.reps ?? '—'}
                      {it.weight ? ` · ${String(it.weight)} кг` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        ))}
      </div>
      <ConfirmDialog
        open={deleting !== null}
        title="Удалить день программы?"
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && void deleteProgram(deleting.id).then(() => toast('День программы удалён', 'trash', 'var(--c-warn)'))}
      >
        «{deleting?.name}» пропадёт из программы. Прошлые тренировки по нему останутся в истории.
      </ConfirmDialog>
      {editing && <ProgramEditor program={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
