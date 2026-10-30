/* Справочник упражнений: поиск, группы, свои упражнения. */
import { useState } from 'react';
import { Link } from 'react-router';
import { Button, Panel, PixelIcon } from '../../../core/ui';
import { GROUPS } from '../domain/types';
import { MUSCLES } from '../domain/muscles';
import { FilterBar } from './ExercisePicker';
import { useExerciseFilter } from '../data/exerciseFilter';
import { ExerciseEditor } from './ExerciseEditor';
import s from './Gym.module.css';

export function ExercisesScreen() {
  const f = useExerciseFilter();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <div className={s.head}>
        <h1 className="glow pageTitle" style={{ color: 'var(--c-gym)' }}>
          Упражнения
        </h1>
        <Button icon="plus" onClick={() => setCreating(true)}>
          Своё
        </Button>
      </div>
      <Panel accent="var(--c-gym)">
        <FilterBar {...f} />
        <ul className={s.list}>
          {f.list.map((e) => (
            <li key={e.id}>
              <Link className={`${s.row} ${s.link}`} to={`/gym/exercises/${e.id}`}>
                <span className={s.grow}>
                  {e.name}
                  {e.custom && <span className={s.dim}> · своё</span>}
                  <br />
                  <span className={s.dim} style={{ fontSize: 'var(--fs-small)' }}>
                    {GROUPS[e.group]} · {e.primary.map((m) => MUSCLES[m].label).join(', ')}
                  </span>
                </span>
                <PixelIcon name="right" size={16} />
              </Link>
            </li>
          ))}
          {f.list.length === 0 && <li className={s.dim}>Ничего не найдено</li>}
        </ul>
      </Panel>
      <ExerciseEditor open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
