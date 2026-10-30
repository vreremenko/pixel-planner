/* Идущая (или прошедшая) тренировка: упражнения и подходы, отметка запускает таймер отдыха. */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, Checkbox, Modal, Panel, cx, toast } from '../../../core/ui';
import { parseValue, formatValue } from '../../../core/domain/numbers';
import { useExercises } from '../data/exercises';
import { useAllSets, usePrefs, useWorkout, useWorkoutSets, useWorkouts } from '../data/hooks';
import { exerciseOrder, formatSet, lastSessionSets, summarize, type WorkoutSummary } from '../domain/logic';
import type { ExerciseDef, Tracking, WorkoutSet } from '../domain/types';
import { addExercise, addSet, deleteWorkout, finishWorkout, removeExercise, removeSet, toggleSet, updateSet } from '../services/workouts';
import { useRestTimer } from '../restTimer';
import { ExercisePicker } from './ExercisePicker';
import s from './Gym.module.css';

/** Поля подхода по типу записи: [подпись, поле, множитель для ввода]. */
const FIELDS: Record<Tracking, readonly [string, 'weight' | 'reps' | 'durationSec' | 'distanceM', number][]> = {
  weight_reps: [['кг', 'weight', 1], ['повт.', 'reps', 1]],
  reps: [['повт.', 'reps', 1]],
  time: [['сек', 'durationSec', 1]],
  distance_time: [['км', 'distanceM', 1000], ['мин', 'durationSec', 60]],
};

function NumberCell({ value, label, mult, onSave }: { value: number | undefined; label: string; mult: number; onSave: (v: number | undefined) => void }) {
  const shown = value === undefined ? '' : formatValue(value / mult);
  const [text, setText] = useState(shown);
  const [prev, setPrev] = useState(shown);
  if (prev !== shown) {
    setPrev(shown);
    setText(shown);
  }
  return (
    <input
      inputMode="decimal"
      aria-label={label}
      placeholder={label}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const v = parseValue(text);
        onSave(v === null ? undefined : Math.round(v * mult * 100) / 100);
      }}
      style={{ textAlign: 'center' }}
    />
  );
}

function SetRow({ set, n, def, rpe, onDone }: { set: WorkoutSet; n: number; def: ExerciseDef | undefined; rpe: boolean; onDone: () => void }) {
  const fields = FIELDS[def?.tracking ?? 'weight_reps'];
  return (
    <div className={cx(s.setRow, set.done && s.setDone)} style={fields.length === 1 ? { gridTemplateColumns: '28px 1fr auto auto' } : undefined}>
      <span className={s.setNum}>{n}</span>
      {fields.map(([label, key, mult]) => (
        <NumberCell key={key} label={label} mult={mult} value={set[key]} onSave={(v) => void updateSet(set, { [key]: v })} />
      ))}
      <Checkbox
        checked={set.done}
        label={`Подход ${String(n)} сделан`}
        color="var(--c-gym)"
        onChange={(v) => {
          void toggleSet(set, v);
          if (v) onDone();
        }}
      />
      <Button small variant="ghost" icon="close" label="Убрать подход" onClick={() => void removeSet(set.id)} />
      {rpe && set.done && (
        <div style={{ gridColumn: '2 / -1' }}>
          <NumberCell label="RPE 1–10" mult={1} value={set.rpe} onSave={(v) => void updateSet(set, { rpe: v === undefined ? undefined : Math.min(10, Math.max(1, v)) })} />
        </div>
      )}
    </div>
  );
}

export function WorkoutScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const workout = useWorkout(id);
  const sets = useWorkoutSets(id);
  const all = useAllSets();
  const workouts = useWorkouts();
  const ex = useExercises();
  const prefs = usePrefs();
  const startRest = useRestTimer((t) => t.start);
  const [picking, setPicking] = useState(false);
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (workout === null) return <p className={s.dim}>Тренировка не найдена. <Link to="/gym">К тренировкам</Link></p>;
  if (!workout || !sets || !all || !workouts || !ex || !prefs) return null;
  const active = !workout.finishedAt;

  const finish = async () => {
    await finishWorkout(workout.id);
    setSummary(summarize({ ...workout, finishedAt: Date.now() }, sets.filter((x) => x.done), all, workouts, ex.byId));
  };

  return (
    <>
      <div className={s.head}>
        <div>
          <h1 className="glow" style={{ color: 'var(--c-gym)' }}>
            {workout.title}
          </h1>
          <span className={s.dim}>{active ? 'идёт тренировка' : new Date(workout.startedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</span>
        </div>
        {active && (
          <Button variant="primary" icon="check" onClick={() => void finish()}>
            Завершить
          </Button>
        )}
      </div>
      <div className={s.stack}>
        {exerciseOrder(sets).map((exId) => {
          const def = ex.byId(exId);
          const mine = sets.filter((x) => x.exerciseId === exId);
          const last = lastSessionSets(all, workouts, exId, workout.id);
          const tracking = def?.tracking ?? 'weight_reps';
          return (
            <Panel
              key={exId}
              title={<Link className={s.link} to={`/gym/exercises/${exId}`}>{def?.name ?? 'Упражнение удалено'}</Link>}
              icon="dumbbell"
              accent="var(--c-gym)"
              actions={active ? <Button small variant="ghost" icon="trash" label="Убрать упражнение" onClick={() => void removeExercise(workout.id, exId)} /> : undefined}
            >
              <p className={s.hint}>{last.length ? `В прошлый раз: ${last.map((x) => formatSet(x, tracking)).join(', ')}` : 'Первый раз — рекорд по умолчанию'}</p>
              {mine.map((set, i) => (
                <SetRow key={set.id} set={set} n={i + 1} def={def} rpe={prefs.rpe} onDone={() => prefs.restTimer.on && startRest(set.restSec ?? prefs.restTimer.sec)} />
              ))}
              {active && (
                <Button small icon="plus" onClick={() => void addSet(workout.id, exId)}>
                  Подход
                </Button>
              )}
            </Panel>
          );
        })}
        {sets.length === 0 && <p className={s.dim}>Добавьте первое упражнение.</p>}
        <div className={s.row} style={{ flexWrap: 'wrap' }}>
          {active && (
            <Button icon="plus" onClick={() => setPicking(true)}>
              Упражнение
            </Button>
          )}
          <Button variant="ghost" icon="trash" onClick={() => setConfirmDelete(true)}>
            Удалить тренировку
          </Button>
        </div>
      </div>
      <ExercisePicker open={picking} onClose={() => setPicking(false)} onPick={(exId) => void addExercise(workout.id, exId)} />
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Удалить тренировку?" accent="var(--c-warn)" footer={
        <>
          <Button onClick={() => setConfirmDelete(false)}>Отмена</Button>
          <Button variant="danger" onClick={() => void deleteWorkout(workout.id).then(() => { toast('Тренировка удалена', 'trash', 'var(--c-warn)'); void navigate('/gym'); })}>
            Удалить
          </Button>
        </>
      }>
        <p style={{ margin: 0 }}>Все подходы этой тренировки будут удалены.</p>
      </Modal>
      <Modal open={summary !== null} onClose={() => void navigate('/gym')} title="Тренировка завершена" accent="var(--c-gym)" footer={<Button variant="primary" onClick={() => void navigate('/gym')}>Отлично</Button>}>
        {summary && (
          <>
            <p style={{ marginTop: 0 }}>
              {summary.durationMin} мин · подходов: {summary.setsDone}
              {summary.tonnage > 0 && ` · тоннаж ${summary.tonnage.toLocaleString('ru-RU')} кг`}
            </p>
            {summary.records.length > 0 ? (
              <p style={{ marginBottom: 0, color: 'var(--c-gym)' }}>★ Новые рекорды: {summary.records.map((r) => ex.byId(r)?.name ?? r).join(', ')}</p>
            ) : (
              <p className={s.dim} style={{ marginBottom: 0 }}>Рекордов в этот раз нет — главное, что тренировка сделана.</p>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
