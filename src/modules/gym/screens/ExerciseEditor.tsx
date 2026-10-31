/* Создание и правка своего упражнения. */
import { useState } from 'react';
import { Button, Field, Modal, MultiToggle, Segmented, SelectInput, TextInput, inputClass, toast } from '../../../core/ui';
import { MUSCLE_IDS, MUSCLES, type MuscleId } from '../domain/muscles';
import { GROUPS, type ExerciseDef, type ExerciseGroup, type Tracking } from '../domain/types';
import { saveExercise } from '../services/programs';

const TRACKING: { value: Tracking; label: string }[] = [
  { value: 'weight_reps', label: 'Вес × повторы' },
  { value: 'reps', label: 'Повторы' },
  { value: 'time', label: 'Время' },
  { value: 'distance_time', label: 'Дистанция' },
];
const MUSCLE_OPTIONS = MUSCLE_IDS.map((m) => ({ value: m, label: MUSCLES[m].label }));

export function ExerciseEditor({ open, onClose, exercise, onSaved }: { open: boolean; onClose: () => void; exercise?: ExerciseDef; onSaved?: (id: string) => void }) {
  const [name, setName] = useState(exercise?.name ?? '');
  const [group, setGroup] = useState<ExerciseGroup>(exercise?.group ?? 'chest');
  const [tracking, setTracking] = useState<Tracking>(exercise?.tracking ?? 'weight_reps');
  const [primary, setPrimary] = useState<MuscleId[]>(exercise?.primary ?? []);
  const [secondary, setSecondary] = useState<MuscleId[]>(exercise?.secondary ?? []);
  const [technique, setTechnique] = useState(exercise?.technique.join('\n') ?? '');

  const save = async () => {
    if (!name.trim() || primary.length === 0) {
      toast('Нужны название и хотя бы одна основная мышца', 'alert', 'var(--c-warn)');
      return;
    }
    const saved = await saveExercise({
      ...(exercise?.custom ? { id: exercise.id } : {}),
      name: name.trim(),
      group,
      tracking,
      primary,
      secondary: secondary.filter((m) => !primary.includes(m)),
      technique: technique.split('\n').map((t) => t.trim()).filter(Boolean),
    });
    toast(exercise ? 'Упражнение сохранено' : 'Упражнение добавлено', 'dumbbell', 'var(--c-gym)');
    onClose();
    onSaved?.(saved.id);
  };

  return (
    <Modal
      open={open}
      keepOnOutsideClick
      onClose={onClose}
      title={exercise ? 'Своё упражнение' : 'Новое упражнение'}
      accent="var(--c-gym)"
      footer={
        <>
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="primary" onClick={() => void save()}>
            Сохранить
          </Button>
        </>
      }
    >
      <TextInput label="Название" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} data-autofocus />
      <SelectInput label="Группа" value={group} options={Object.entries(GROUPS).map(([value, label]) => ({ value, label }))} onChange={(e) => setGroup(e.target.value as ExerciseGroup)} />
      <Field label="Что записывать">
        <Segmented value={tracking} options={TRACKING} onChange={setTracking} label="Что записывать" />
      </Field>
      <Field label="Основные мышцы">
        <MultiToggle values={primary} options={MUSCLE_OPTIONS} onChange={setPrimary} label="Основные мышцы" />
      </Field>
      <Field label="Вспомогательные мышцы">
        <MultiToggle values={secondary} options={MUSCLE_OPTIONS.filter((o) => !primary.includes(o.value))} onChange={setSecondary} label="Вспомогательные мышцы" />
      </Field>
      <Field label="Техника (каждый пункт с новой строки)">
        <textarea className={inputClass} rows={4} value={technique} onChange={(e) => setTechnique(e.target.value)} style={{ width: '100%' }} />
      </Field>
    </Modal>
  );
}
