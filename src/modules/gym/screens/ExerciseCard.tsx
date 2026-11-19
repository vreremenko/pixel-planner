/* Карточка упражнения: атлет с работающими мышцами, техника, мои результаты. */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, ConfirmDialog, Panel, TextInput, toast } from '../../../core/ui';
import { useExercises } from '../data/exercises';
import { useAllSets, usePrefs, useWorkouts } from '../data/hooks';
import { prefsRepo } from '../data/repo';
import { DEFAULT_WEIGHT_STEP, kgText } from '../domain/progression';
import { parseValue } from '../../../core/domain/numbers';
import { bestSet, e1rm, formatSet } from '../domain/logic';
import { MUSCLES } from '../domain/muscles';
import { GROUPS } from '../domain/types';
import { deleteExercise } from '../services/programs';
import { MuscleMap } from '../ui/MuscleMap';
import { PRIMARY_COLOR, SECONDARY_COLOR } from '../ui/muscleGrid';
import { ExerciseEditor } from './ExerciseEditor';
import { ExerciseAnimation } from '../ui/ExerciseAnimation';
import { ANIMS, type Anim } from '../ui/anims';
import s from './Gym.module.css';

/** Шаг снаряда для подсказки «можно добавить вес»: у штанги 2,5 кг, у гантелей 2, у тренажёра 5. */
function WeightStep({ exerciseId, steps }: { exerciseId: string; steps: Record<string, number> | undefined }) {
  const cur = steps?.[exerciseId] ?? DEFAULT_WEIGHT_STEP;
  return (
    <div style={{ maxWidth: 240, marginBottom: 12 }}>
      <TextInput
        key={cur}
        label="Шаг веса, кг"
        inputMode="decimal"
        defaultValue={kgText(cur)}
        onBlur={(e) => {
          const v = parseValue(e.target.value);
          if (v === null || v <= 0 || v > 50) {
            e.target.value = kgText(cur);
            return;
          }
          if (v !== cur) void prefsRepo.patch({ weightSteps: { ...steps, [exerciseId]: v } });
        }}
      />
      <p className={s.hint} style={{ marginTop: 4 }}>
        Насколько можно добавить вес на этом снаряде: штанга 2,5, гантели 2, тренажёр 5.
      </p>
    </div>
  );
}

export function ExerciseCard() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const ex = useExercises();
  const sets = useAllSets();
  const workouts = useWorkouts();
  const prefs = usePrefs();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [anim, setAnim] = useState<{ id: string; data: Anim } | null>(null);
  useEffect(() => {
    const load = ANIMS[id];
    if (!load) return;
    let alive = true;
    void load().then((data) => alive && setAnim({ id, data }));
    return () => {
      alive = false;
    };
  }, [id]);
  const def = ex?.byId(id);

  const sessions = useMemo(() => {
    if (!sets || !workouts) return [];
    const finished = new Map(workouts.filter((w) => w.finishedAt).map((w) => [w.id, w]));
    const mine = sets.filter((x) => x.exerciseId === id && x.done && finished.has(x.workoutId));
    const by = new Map<string, typeof mine>();
    for (const x of mine) by.set(x.workoutId, [...(by.get(x.workoutId) ?? []), x]);
    return [...by].map(([wid, list]) => ({ workout: finished.get(wid), sets: list.sort((a, b) => a.order - b.order) })).sort((a, b) => (b.workout?.startedAt ?? 0) - (a.workout?.startedAt ?? 0));
  }, [sets, workouts, id]);

  if (!ex || !sets) return null;
  if (!def) return <p className={s.dim}>Упражнение не найдено. <Link to="/gym/exercises">К списку</Link></p>;
  const all = sessions.flatMap((x) => x.sets);
  const best = bestSet(all, def.tracking);
  const max = best && def.tracking === 'weight_reps' ? e1rm(best.weight, best.reps) : null;

  return (
    <>
      <div className={s.head}>
        <div>
          <h1 className="glow" style={{ color: 'var(--c-gym)' }}>
            {def.name}
          </h1>
          <span className={s.dim}>
            {GROUPS[def.group]}
            {def.custom && ' · своё упражнение'}
          </span>
        </div>
        {def.custom && (
          <div className={s.row}>
            <Button small icon="edit" onClick={() => setEditing(true)}>
              Изменить
            </Button>
            <Button small variant="ghost" icon="trash" label="Удалить упражнение" onClick={() => setDeleting(true)} />
          </div>
        )}
      </div>
      <div className={s.stack}>
        <Panel accent="var(--c-gym)">
          <div className={s.card}>
            <div className={s.cardMap}>
              <MuscleMap primary={def.primary} secondary={def.secondary} />
            </div>
            <p className={s.cardMuscles}>
              <b style={{ color: PRIMARY_COLOR }}>■</b> {def.primary.map((m) => MUSCLES[m].label).join(', ')}
              {def.secondary.length > 0 && (
                <>
                  <br />
                  <b style={{ color: SECONDARY_COLOR }}>■</b> {def.secondary.map((m) => MUSCLES[m].label).join(', ')}
                </>
              )}
            </p>
            {def.technique.length > 0 && (
              <div className={s.cardTech}>
                <h3 style={{ margin: '0 0 6px' }}>Техника</h3>
                <ul className={s.techList}>
                  {def.technique.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Panel>
        {anim?.id === id && (
          <Panel title="Как выполнять" icon="dumbbell" accent="var(--c-gym)">
            <ExerciseAnimation anim={anim.data} label={`Анимация: ${def.name}`} />
          </Panel>
        )}
        <Panel title="Мои результаты" icon="bars" accent="var(--c-gym)">
          {sessions.length === 0 ? (
            <p className={s.dim} style={{ margin: 0 }}>
              Ещё не делали. Добавьте упражнение в тренировку — здесь появятся лучший подход и история.
            </p>
          ) : (
            <>
              <p style={{ marginTop: 0 }}>
                Лучший подход: <b style={{ color: 'var(--c-gym)' }}>{best ? formatSet(best, def.tracking) : '—'}</b>
                {max !== null && <span className={s.dim}> · расчётный максимум {max} кг</span>}
                <br />
                <span className={s.dim}>Тренировок с упражнением: {sessions.length}</span>
              </p>
              {def.tracking === 'weight_reps' && prefs && <WeightStep exerciseId={def.id} steps={prefs.weightSteps} />}
              <ul className={s.list}>
                {sessions.slice(0, 8).map(({ workout, sets: list }) => (
                  <li key={workout?.id} className={s.row}>
                    <span className={s.dim} style={{ minWidth: '7ch' }}>
                      {workout ? new Date(workout.startedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : ''}
                    </span>
                    <span className={s.grow}>{list.map((x) => formatSet(x, def.tracking)).join(', ')}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      </div>
      <ConfirmDialog
        open={deleting}
        title="Удалить упражнение?"
        onClose={() => setDeleting(false)}
        onConfirm={() =>
          void deleteExercise(def.id).then(() => {
            toast('Упражнение удалено', 'trash', 'var(--c-warn)');
            void navigate('/gym/exercises');
          })
        }
      >
        «{def.name}» пропадёт из списка упражнений.
      </ConfirmDialog>
      {def.custom && editing && <ExerciseEditor open onClose={() => setEditing(false)} exercise={def} />}
    </>
  );
}
