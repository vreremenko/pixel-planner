/* Идущая (или прошедшая) тренировка: упражнения и подходы, отметка запускает таймер отдыха. */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, Checkbox, ConfirmDialog, Modal, Panel, cx, toast } from '../../../core/ui';
import { parseValue, formatValue } from '../../../core/domain/numbers';
import { useExercises } from '../data/exercises';
import { useAllSets, usePrefs, usePrograms, useWorkout, useWorkoutSets, useWorkouts } from '../data/hooks';
import { durationInput, parseDuration } from '../domain/tracking';
import { DEFAULT_WEIGHT_STEP, kgText, suggestWeight } from '../domain/progression';
import { exerciseOrder, lastSessionSets, programItemsFromSets, summarize, type WorkoutSummary } from '../domain/logic';
import type { ExerciseDef, Tracking, WorkoutSet } from '../domain/types';
import { addExercise, addSet, deleteWorkout, finishWorkout, removeExercise, removeSet, toggleSet, updateSet } from '../services/workouts';
import { useRestTimer } from '../restTimer';
import { ExercisePicker } from './ExercisePicker';
import { ProgramEditor } from './ProgramEditor';
import { useIsMobile } from '../../../core/shell/topbarSlot';
import s from './Gym.module.css';

type SetKey = 'weight' | 'reps' | 'durationSec' | 'distanceM';
interface CellKind {
  label: string;
  key: SetKey;
  show: (v: number) => string;
  parse: (t: string) => number | null;
}
const number = (label: string, key: SetKey, mult = 1): CellKind => ({
  label,
  key,
  show: (v) => formatValue(v / mult),
  parse: (t) => {
    const v = parseValue(t);
    return v === null ? null : Math.round(v * mult * 100) / 100;
  },
});
const duration = (label: string, plain: 'sec' | 'min'): CellKind => ({ label, key: 'durationSec', show: (v) => durationInput(v, plain), parse: (t) => parseDuration(t, plain) });

/** Поля подхода по типу записи. Время вводится как «1:30» или числом: секунды у упражнений на время, минуты у кардио. */
const FIELDS: Record<Tracking, readonly CellKind[]> = {
  weight_reps: [number('кг', 'weight'), number('повт.', 'reps')],
  reps: [number('повт.', 'reps')],
  time: [duration('сек', 'sec')],
  distance_time: [number('км', 'distanceM', 1000), duration('мин', 'min')],
};

const RPE: CellKind = { label: 'RPE 1–10', key: 'reps', show: (v) => formatValue(v), parse: parseValue };

function NumberCell({ value, kind, onSave }: { value: number | undefined; kind: CellKind; onSave: (v: number | undefined) => void }) {
  const { label } = kind;
  const shown = value === undefined ? '' : kind.show(value);
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
        const v = kind.parse(text);
        // Непонятное значение не стираем молча: возвращаем прежнее
        if (v === null && text.trim()) setText(shown);
        else onSave(v ?? undefined);
      }}
      style={{ textAlign: 'center' }}
    />
  );
}

/** Подписи колонок над подходами: в заполненном поле подсказки не видно, а «45» без единицы непонятно. */
function SetHeader({ tracking }: { tracking: Tracking }) {
  const fields = FIELDS[tracking];
  return (
    <div className={cx(s.setRow, s.setHead)} style={fields.length === 1 ? { gridTemplateColumns: '28px 1fr auto auto', minHeight: 0 } : { minHeight: 0 }} aria-hidden="true">
      <span />
      {fields.map((f) => (
        <span key={f.key}>{f.label}</span>
      ))}
      <span className={s.setHeadPad} />
      <span className={s.setHeadPad} />
    </div>
  );
}

function SetRow({ set, n, def, rpe, onDone }: { set: WorkoutSet; n: number; def: ExerciseDef | undefined; rpe: boolean; onDone: () => void }) {
  const fields = FIELDS[def?.tracking ?? 'weight_reps'];
  return (
    <div className={cx(s.setRow, set.done && s.setDone)} style={fields.length === 1 ? { gridTemplateColumns: '28px 1fr auto auto' } : undefined}>
      <span className={s.setNum}>{n}</span>
      {fields.map((f) => (
        <NumberCell key={f.key} kind={f} value={set[f.key]} onSave={(v) => void updateSet(set, { [f.key]: v })} />
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
          <NumberCell kind={RPE} value={set.rpe} onSave={(v) => void updateSet(set, { rpe: v === undefined ? undefined : Math.min(10, Math.max(1, v)) })} />
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
  const programs = usePrograms();
  const startRest = useRestTimer((t) => t.start);
  const stopRest = useRestTimer((t) => t.stop);
  const [picking, setPicking] = useState(false);
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const mobile = useIsMobile();

  if (workout === null) return <p className={s.dim}>Тренировка не найдена. <Link to="/gym">К тренировкам</Link></p>;
  if (!workout || !sets || !all || !workouts || !ex || !prefs) return null;
  const active = !workout.finishedAt;

  const finish = async () => {
    // Тренировки больше нет — отдыхать не от чего
    stopRest();
    // Ни одного отмеченного подхода — в историю такую тренировку не кладём
    if (!sets.some((x) => x.done)) {
      await deleteWorkout(workout.id);
      toast('Нет отмеченных подходов — тренировка не сохранена', 'alert', 'var(--c-warn)');
      void navigate('/gym');
      return;
    }
    await finishWorkout(workout.id);
    setSummary(summarize({ ...workout, finishedAt: Date.now() }, sets.filter((x) => x.done), all, workouts, ex.byId));
  };

  // Свободную тренировку (не из программы) можно сохранить как день программы
  const canSave = !workout.programId && sets.some((x) => x.done);
  const draftItems = () => programItemsFromSets(sets, (id) => ex.byId(id)?.tracking ?? 'weight_reps');
  const done = () => {
    setSaving(false);
    void navigate('/gym');
  };

  const remove = async () => {
    stopRest();
    await deleteWorkout(workout.id);
    toast('Тренировка удалена', 'trash', 'var(--c-warn)');
    void navigate('/gym');
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
        {active && !mobile && (
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
          // Подсказка прогрессии: только в идущей тренировке по программе, где задан диапазон повторов
          const target = programs?.find((p) => p.id === workout.programId)?.items.find((it) => it.exerciseId === exId)?.reps;
          const tip = active && def && tracking === 'weight_reps' ? suggestWeight(last, target, def.group, prefs.weightSteps?.[exId] ?? DEFAULT_WEIGHT_STEP) : null;
          const lighter = tip ? mine.filter((x) => !x.done && (x.weight ?? 0) < tip.weight) : [];
          return (
            <Panel
              key={exId}
              title={<Link className={s.link} to={`/gym/exercises/${exId}`}>{def?.name ?? 'Упражнение удалено'}</Link>}
              icon="dumbbell"
              accent="var(--c-gym)"
              actions={active ? <Button small variant="ghost" icon="trash" label="Убрать упражнение" onClick={() => setRemoving(exId)} /> : undefined}
            >
              {/* Прошлые подходы уже стоят в полях — повторять их строкой не нужно; подсказка только когда пора прибавить вес */}
              {tip && (
                <p className={s.tip}>
                  Все подходы дошли до {tip.reps} — пора прибавить: {kgText(tip.weight)} кг (+{kgText(tip.weight - tip.from)}).{' '}
                  {lighter.length > 0 && (
                    <Button small variant="ghost" onClick={() => void Promise.all(lighter.map((x) => updateSet(x, { weight: tip.weight })))}>
                      Поставить {kgText(tip.weight)}
                    </Button>
                  )}
                </p>
              )}
              {mine.length > 0 && <SetHeader tracking={tracking} />}
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
          {!active && canSave && (
            <Button icon="book" onClick={() => setSaving(true)}>
              Сохранить как программу
            </Button>
          )}
          <Button variant="ghost" icon="trash" onClick={() => setConfirmDelete(true)}>
            Удалить тренировку
          </Button>
        </div>
        {active && mobile && (
          <Button variant="primary" icon="check" onClick={() => void finish()}>
            Завершить тренировку
          </Button>
        )}
      </div>
      <ExercisePicker open={picking} onClose={() => setPicking(false)} onPick={(exId) => void addExercise(workout.id, exId)} />
      <ConfirmDialog open={confirmDelete} title="Удалить тренировку?" onClose={() => setConfirmDelete(false)} onConfirm={() => void remove()}>
        Все подходы этой тренировки будут удалены.
      </ConfirmDialog>
      <ConfirmDialog
        open={removing !== null}
        title="Убрать упражнение?"
        action="Убрать"
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && void removeExercise(workout.id, removing)}
      >
        «{removing ? (ex.byId(removing)?.name ?? '') : ''}» и все его подходы в этой тренировке будут удалены.
      </ConfirmDialog>
      <Modal open={summary !== null} onClose={() => void navigate('/gym')} title="Тренировка завершена" accent="var(--c-gym)" footer={
        canSave ? (
          <>
            <Button onClick={() => void navigate('/gym')}>Не сохранять</Button>
            <Button variant="primary" icon="book" onClick={() => setSaving(true)}>
              Сохранить как программу
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={() => void navigate('/gym')}>Отлично</Button>
        )
      }>
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
            {canSave && <p className={s.hint}>Это была свободная тренировка. Сохранить её как день программы, чтобы повторять в следующий раз?</p>}
          </>
        )}
      </Modal>
      {saving && <ProgramEditor draft={draftItems()} onClose={summary ? done : () => setSaving(false)} />}
    </>
  );
}
