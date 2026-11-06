/* Настройки плана: рабочие дни, откладывание, советы и категории. */
import { useState } from 'react';
import { Button, Field, Modal, MultiToggle, SelectInput, TextInput, cx, inputClass, toast } from '../../../core/ui';
import { ToggleRow } from '../../../core/settings/ToggleRow';
import { WEEKDAYS_SHORT } from '../../../core/domain/dates';
import type { Weekday } from '../../../core/domain/types';
import { categoryRepo, prefsRepo } from '../data/repo';
import { DEFAULT_SAVE_PERCENT } from '../domain/tips';
import { defaultSaveAccount, savingAccounts } from '../domain/save';
import { ALL_DAYS, type Account, type Category, type CategoryKind, type FinPrefs } from '../domain/types';
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

export function PlanPrefsModal({ prefs, accounts, categories, onClose }: { prefs: FinPrefs; accounts: Account[]; categories: Category[]; onClose: () => void }) {
  const jars = savingAccounts(accounts).map((a) => ({ value: a.id, label: a.name }));
  const [work, setWork] = useState<readonly Weekday[]>(prefs.workDays ?? ALL_DAYS);
  const [percent, setPercent] = useState(prefs.savePercent === undefined ? '' : String(prefs.savePercent));
  const [showTips, setShowTips] = useState(!prefs.tipsOff);
  const [saveOn, setSaveOn] = useState(!!prefs.saveOn);
  const [saveTo, setSaveTo] = useState(defaultSaveAccount(accounts, prefs) ?? jars[0]?.value ?? '');
  const form = JSON.stringify([[...work].sort(), percent, showTips, saveOn, saveTo]);
  // Снимок полей при открытии: по нему видно, что есть несохранённые правки.
  const [opened] = useState(form);
  const [asking, setAsking] = useState(false);
  const close = () => (form === opened ? onClose() : setAsking(true));

  const save = async () => {
    const p = percent.trim() ? Number(percent.replace(',', '.')) : undefined;
    if (p !== undefined && !(p >= 0 && p <= 100)) {
      toast('Процент должен быть от 0 до 100', 'alert', 'var(--c-warn)');
      return;
    }
    if (work.length === 0) {
      toast('Отметьте хотя бы один рабочий день', 'alert', 'var(--c-warn)');
      return;
    }
    await prefsRepo.put({ workDays: [...work], ...(p === undefined ? {} : { savePercent: p }), ...(showTips ? {} : { tipsOff: true }), ...(saveOn ? { saveOn: true } : {}), ...(saveTo ? { saveAccountId: saveTo } : {}) });
    onClose();
  };

  return (
    <Modal keepOnOutsideClick open onClose={close} title="Настройки" accent="var(--c-fin)" footer={
      <>
        <Button onClick={close}>Отмена</Button>
        <Button variant="primary" onClick={() => void save()}>Сохранить</Button>
      </>
    }>
      <Field label="Рабочие дни">
        <MultiToggle values={work} options={DAYS} onChange={setWork} label="Рабочие дни" />
      </Field>
      <ToggleRow label="Показывать советы" hint="Строка над вкладками. Нажмите на неё, чтобы остановить текст, и ещё раз, чтобы увидеть другой совет." checked={showTips} onChange={setShowTips} color="var(--c-fin)" />
      <TextInput label="Откладывать с дохода, %" inputMode="decimal" placeholder={String(DEFAULT_SAVE_PERCENT)} value={percent} onChange={(e) => setPercent(e.target.value)} />
      <p className={s.hint}>Столько откладывать с дохода. Если откладывание ниже выключено, совет покажет эту долю от свежего дохода, когда на платежи хватает. 0 отключает совет.</p>
      <ToggleRow label="Предлагать отложить при записи дохода" hint="Под суммой дохода появится строка: часть уйдёт переводом в копилку, весь доход при этом останется в статистике." checked={saveOn} onChange={setSaveOn} color="var(--c-fin)" />
      {saveOn &&
        (jars.length > 0 ? (
          <SelectInput label="Копилка по умолчанию" value={saveTo} options={jars} onChange={(e) => setSaveTo(e.target.value)} />
        ) : (
          <p className={s.warn}>Нет счёта вне плана. Добавьте копилку на вкладке «План» в «Счета» и снимите у неё «Учитывать в плане».</p>
        ))}
      <CategoryList kind="expense" title="Категории расходов" categories={categories} />
      <CategoryList kind="income" title="Категории доходов" categories={categories} />
      <Modal open={asking} onClose={() => setAsking(false)} title="Сохранить изменения?" accent="var(--c-warn)" footer={
        <>
          <Button onClick={onClose}>Не сохранять</Button>
          <Button variant="primary" onClick={() => {
            setAsking(false);
            void save();
          }}>Сохранить</Button>
        </>
      }>
        <p style={{ margin: 0 }}>Настройки изменены, но не сохранены.</p>
      </Modal>
    </Modal>
  );
}
