/* Программа: дни тренировок со списком упражнений и целевыми подходами. */
import { useState } from 'react';
import { Button, ConfirmDialog, Panel, toast } from '../../../core/ui';
import { useExercises } from '../data/exercises';
import { usePrograms } from '../data/hooks';
import type { Program } from '../domain/types';
import { daysLabel } from '../domain/logic';
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
