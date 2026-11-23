/* Программа: дни тренировок со списком упражнений и целевыми подходами. */
import { STARTER_PROGRAMS } from '../domain/starter';
import { saveProgram } from '../services/programs';
import { useState } from 'react';
import { Button, ConfirmDialog, Panel, toast } from '../../../core/ui';
import { useExercises } from '../data/exercises';
import { usePrograms } from '../data/hooks';
import type { Program } from '../domain/types';
import { daysLabel } from '../domain/logic';
import { programTarget } from '../domain/tracking';
import { deleteProgram, moveProgram } from '../services/programs';
import { ProgramEditor } from './ProgramEditor';
import s from './Gym.module.css';

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
          <>
            <p className={s.dim}>
              Программа — это дни тренировок, например «Грудь», «Спина», «Ноги». Каждому дню можно назначить дни недели — тогда «Сегодня» покажет, что по плану, а вес подставится из прошлого раза.
            </p>
            <Panel title="Взять готовую" icon="star" accent="var(--c-gym)">
              <p className={s.dim} style={{ marginTop: 0 }}>
                Всё тело три раза в неделю (пн, ср, пт) — для начала хватит. Упражнения и подходы потом поменяете.
              </p>
              {STARTER_PROGRAMS.map((p) => (
                <div key={p.key} style={{ marginBottom: 12 }}>
                  <Button icon="plus" onClick={() => void saveProgram({ name: p.name, items: p.items, days: [0, 2, 4] })}>
                    {p.label}
                  </Button>
                  <div className={s.dim} style={{ marginTop: 8 }}>{p.hint}</div>
                </div>
              ))}
            </Panel>
          </>
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
                    <span className={s.dim}>{programTarget(it, ex?.byId(it.exerciseId)?.tracking ?? 'weight_reps')}</span>
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
