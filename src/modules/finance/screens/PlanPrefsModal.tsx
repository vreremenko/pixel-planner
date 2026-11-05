/* Настройки плана: рабочие дни, сумма на жизнь и категории. */
import { useState } from 'react';
import { Button, Field, Modal, MultiToggle, TextInput, cx, inputClass, toast } from '../../../core/ui';
import { WEEKDAYS_SHORT } from '../../../core/domain/dates';
import type { Weekday } from '../../../core/domain/types';
import { categoryRepo, prefsRepo } from '../data/repo';
import { kopecksText, rub, toKopecks } from '../domain/money';
import { ALL_DAYS, type Category, type CategoryKind, type FinPrefs, type Kopecks } from '../domain/types';
import s from './Finance.module.css';

const DAYS = ALL_DAYS.map((d) => ({ value: d, label: WEEKDAYS_SHORT[d] ?? '' }));

function CategoryList({ kind, title, categories }: { kind: CategoryKind; title: string; categories: Category[] }) {
  const [name, setName] = useState('');
  const add = async () => {
    if (!name.trim()) return;
    await categoryRepo.save({ name: name.trim(), kind });
    setName('');
  };
  return (
    <Field label={title}>
      <ul className={s.list}>
        {categories.filter((c) => c.kind === kind && !c.archived).map((c) => (
          <li key={c.id} className={s.row}>
            <div className={s.line}>
              <input className={cx(inputClass, s.grow)} aria-label={`Название: ${c.name}`} defaultValue={c.name} onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== c.name) void categoryRepo.save({ ...c, name: v });
              }} />
              <Button small variant="ghost" icon="trash" label={`В архив: ${c.name}`} onClick={() => void categoryRepo.save({ ...c, archived: true })} />
            </div>
          </li>
        ))}
      </ul>
      <div className={s.line}>
        <input className={cx(inputClass, s.grow)} aria-label="Новая категория" placeholder="Новая категория" value={name} onChange={(e) => setName(e.target.value)} />
        <Button small icon="plus" label="Добавить категорию" onClick={() => void add()} />
      </div>
    </Field>
  );
}

export function PlanPrefsModal({ prefs, average, categories, onClose }: { prefs: FinPrefs; average: Kopecks | null; categories: Category[]; onClose: () => void }) {
  const [work, setWork] = useState<readonly Weekday[]>(prefs.workDays ?? ALL_DAYS);
  const [living, setLiving] = useState(prefs.livingManual === undefined ? '' : kopecksText(prefs.livingManual));

  const save = async () => {
    const k = living.trim() ? toKopecks(living) : undefined;
    if (k === null) {
      toast('Сумма на жизнь не похожа на число', 'alert', 'var(--c-warn)');
      return;
    }
    if (work.length === 0) {
      toast('Отметьте хотя бы один рабочий день', 'alert', 'var(--c-warn)');
      return;
    }
    await prefsRepo.put({ workDays: [...work], ...(k === undefined ? {} : { livingManual: k }) });
    onClose();
  };

  return (
    <Modal keepOnOutsideClick open onClose={onClose} title="Настройки" accent="var(--c-fin)" footer={
      <>
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="primary" onClick={() => void save()}>Сохранить</Button>
      </>
    }>
      <Field label="Рабочие дни">
        <MultiToggle values={work} options={DAYS} onChange={setWork} label="Рабочие дни" />
      </Field>
      <TextInput label="На жизнь в день, ₽" inputMode="decimal" placeholder={average === null ? 'Например, 800' : String(Math.round(average / 100))} value={living} onChange={(e) => setLiving(e.target.value)} />
      <p className={s.hint}>
        {average === null ? 'Пока записей мало, поэтому среднее посчитать нельзя: укажите сумму сами.' : `Среднее за 30 дней: ${rub(average)}. Оставьте поле пустым, чтобы считать по среднему.`}
      </p>
      <CategoryList kind="expense" title="Категории расходов" categories={categories} />
      <CategoryList kind="income" title="Категории доходов" categories={categories} />
    </Modal>
  );
}
