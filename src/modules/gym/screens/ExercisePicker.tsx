/* Выбор упражнения из справочника и своих: поиск и группы. */
import { Modal, Segmented, TextInput } from '../../../core/ui';
import { FILTERS, useExerciseFilter } from '../data/exerciseFilter';
import { GROUPS } from '../domain/types';
import s from './Gym.module.css';

export function FilterBar({ q, setQ, group, setGroup }: Pick<ReturnType<typeof useExerciseFilter>, 'q' | 'setQ' | 'group' | 'setGroup'>) {
  return (
    <>
      <TextInput label="Поиск" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Например: жим" />
      <div style={{ overflowX: 'auto', margin: '8px 0 12px' }}>
        <Segmented value={group} options={FILTERS} onChange={setGroup} label="Группа мышц" />
      </div>
    </>
  );
}

export function ExercisePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const f = useExerciseFilter();
  return (
    <Modal open={open} onClose={onClose} title="Добавить упражнение" accent="var(--c-gym)">
      <FilterBar {...f} />
      <ul className={s.list}>
        {f.list.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              className={s.row}
              style={{ width: '100%', background: 'none', border: 0, color: 'inherit', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}
              onClick={() => {
                onPick(e.id);
                onClose();
              }}
            >
              <span className={s.grow}>{e.name}</span>
              <span className={s.dim}>{GROUPS[e.group]}</span>
            </button>
          </li>
        ))}
        {f.list.length === 0 && <li className={s.dim}>Ничего не найдено</li>}
      </ul>
    </Modal>
  );
}
