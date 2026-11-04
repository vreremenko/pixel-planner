/* Цель на день: калькулятор по формуле Миффлина — Сан-Жеора и ручная правка любого числа. */
import { useState } from 'react';
import { Button, Field, Modal, SelectInput, Segmented, TextInput, toast } from '../../../core/ui';
import { parseValue } from '../../../core/domain/numbers';
import { prefsRepo } from '../data/repo';
import { calcGoal } from '../domain/logic';
import { ACTIVITY, type FoodPrefs, type GoalKind, type Macros, type Profile, type Sex } from '../domain/types';
import s from './Food.module.css';

const SEX = [{ value: 'male', label: 'Мужчина' }, { value: 'female', label: 'Женщина' }] as const;
const GOALS = [{ value: 'lose', label: 'Похудеть' }, { value: 'keep', label: 'Держать вес' }, { value: 'gain', label: 'Набрать' }] as const;
const text = (n: number | undefined) => (n === undefined ? '' : String(n));

export function GoalsModal({ prefs, onClose }: { prefs: FoodPrefs; onClose: () => void }) {
  const p = prefs.profile;
  const [sex, setSex] = useState<Sex>(p?.sex ?? 'male');
  const [age, setAge] = useState(text(p?.age));
  const [height, setHeight] = useState(text(p?.height));
  const [weight, setWeight] = useState(text(p?.weight));
  const [activity, setActivity] = useState(text(p?.activity) || '1.375');
  const [goal, setGoal] = useState<GoalKind>(p?.goal ?? 'keep');
  const [kcal, setKcal] = useState(text(prefs.goal?.kcal));
  const [protein, setProtein] = useState(text(prefs.goal?.protein));
  const [fat, setFat] = useState(text(prefs.goal?.fat));
  const [carbs, setCarbs] = useState(text(prefs.goal?.carbs));

  const profile = (): Profile | null => {
    const a = parseValue(age);
    const h = parseValue(height);
    const w = parseValue(weight);
    return a && h && w ? { sex, age: a, height: h, weight: w, activity: Number(activity), goal } : null;
  };

  const calculate = () => {
    const pr = profile();
    if (!pr) {
      toast('Заполните возраст, рост и вес', 'alert', 'var(--c-warn)');
      return;
    }
    const g = calcGoal(pr);
    setKcal(String(g.kcal));
    setProtein(String(g.protein));
    setFat(String(g.fat));
    setCarbs(String(g.carbs));
  };

  const save = async () => {
    const g: Macros = { kcal: parseValue(kcal) ?? 0, protein: parseValue(protein) ?? 0, fat: parseValue(fat) ?? 0, carbs: parseValue(carbs) ?? 0 };
    if (g.kcal <= 0) {
      toast('Укажите норму калорий', 'alert', 'var(--c-warn)');
      return;
    }
    const pr = profile();
    await prefsRepo.patch({ goal: g, ...(pr ? { profile: pr } : {}) });
    onClose();
  };

  return (
    <Modal keepOnOutsideClick open onClose={onClose} title="Цель на день" accent="var(--c-food)" footer={
      <>
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="primary" onClick={() => void save()}>Сохранить</Button>
      </>
    }>
      <Field label="Пол">
        <Segmented value={sex} options={SEX} onChange={setSex} label="Пол" accent="var(--c-food)" />
      </Field>
      <div className={s.grid3}>
        <TextInput label="Возраст" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} />
        <TextInput label="Рост, см" inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value)} />
        <TextInput label="Вес, кг" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
      </div>
      <SelectInput label="Активность" value={activity} options={[...ACTIVITY]} onChange={(e) => setActivity(e.target.value)} />
      <Field label="Цель">
        <Segmented value={goal} options={GOALS} onChange={setGoal} label="Цель" accent="var(--c-food)" />
      </Field>
      <Button onClick={calculate}>Рассчитать</Button>
      <p className={s.hint}>Норма на день. Рассчитанные числа можно поправить вручную.</p>
      <div className={s.grid4}>
        <TextInput label="Ккал" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} />
        <TextInput label="Белки, г" inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)} />
        <TextInput label="Жиры, г" inputMode="numeric" value={fat} onChange={(e) => setFat(e.target.value)} />
        <TextInput label="Углев., г" inputMode="numeric" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
      </div>
    </Modal>
  );
}
