/* Свой продукт (КБЖУ на 100 г) и своё блюдо (ингредиенты по граммам). */
import { useState } from 'react';
import { Button, ConfirmDialog, Modal, TextInput, toast } from '../../../core/ui';
import { parseValue } from '../../../core/domain/numbers';
import type { LocalDate } from '../../../core/domain/types';
import { dishPer100, macroLine } from '../domain/logic';
import type { FoodItem, Ingredient, Meal } from '../domain/types';
import { deleteFood, saveFood } from '../services/foods';
import { FoodSearch } from './FoodSearch';
import s from './Food.module.css';

const text = (n: number | undefined) => (n === undefined ? '' : String(n));

function DeleteButton({ item, onDone }: { item: FoodItem | undefined; onDone: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!item) return null;
  return (
    <>
      <Button variant="ghost" icon="trash" label="Удалить" onClick={() => setAsking(true)} />
      <ConfirmDialog open={asking} title="Удалить из своих?" onClose={() => setAsking(false)} onConfirm={() => void deleteFood(item.id).then(onDone)}>
        «{item.name}» пропадёт из поиска. Записи в дневнике останутся.
      </ConfirmDialog>
    </>
  );
}

export function ProductEditor({ item, onClose, onSaved }: { item?: FoodItem | undefined; onClose: () => void; onSaved?: (x: FoodItem) => void }) {
  const [name, setName] = useState(item?.name ?? '');
  const [kcal, setKcal] = useState(text(item?.kcal));
  const [protein, setProtein] = useState(text(item?.protein));
  const [fat, setFat] = useState(text(item?.fat));
  const [carbs, setCarbs] = useState(text(item?.carbs));
  const [portion, setPortion] = useState(text(item?.portion));

  const save = async () => {
    const k = parseValue(kcal);
    if (!name.trim() || k === null) {
      toast('Нужны название и калории', 'alert', 'var(--c-warn)');
      return;
    }
    const p = parseValue(portion);
    const { portion: _p, ...base } = item ?? ({ kind: 'product' } as Partial<FoodItem>);
    const row = await saveFood({ ...base, kind: 'product', name: name.trim(), kcal: k, protein: parseValue(protein) ?? 0, fat: parseValue(fat) ?? 0, carbs: parseValue(carbs) ?? 0, ...(p ? { portion: p } : {}) });
    onSaved?.(row);
    onClose();
  };

  return (
    <Modal keepOnOutsideClick open onClose={onClose} title={item ? 'Мой продукт' : 'Новый продукт'} accent="var(--c-food)" footer={
      <>
        <DeleteButton item={item} onDone={onClose} />
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="primary" onClick={() => void save()}>Сохранить</Button>
      </>
    }>
      <TextInput label="Название" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} data-autofocus />
      <p className={s.hint}>Значения на 100 г: они есть на упаковке.</p>
      <div className={s.grid4}>
        <TextInput label="Ккал" inputMode="decimal" value={kcal} onChange={(e) => setKcal(e.target.value)} />
        <TextInput label="Белки" inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} />
        <TextInput label="Жиры" inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} />
        <TextInput label="Углеводы" inputMode="decimal" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
      </div>
      <TextInput label="Обычная порция, г" inputMode="decimal" value={portion} placeholder="Необязательно" onChange={(e) => setPortion(e.target.value)} />
    </Modal>
  );
}

export function DishEditor({ item, date, meal, onClose, onSaved }: { item?: FoodItem | undefined; date: LocalDate; meal: Meal; onClose: () => void; onSaved?: (x: FoodItem) => void }) {
  const [name, setName] = useState(item?.name ?? '');
  const [items, setItems] = useState<Ingredient[]>(item?.ingredients ?? []);
  const [cooked, setCooked] = useState(text(item?.cookedWeight));
  const [picking, setPicking] = useState(false);
  const cookedWeight = parseValue(cooked) ?? undefined;
  const per100 = dishPer100(items, cookedWeight);
  const raw = items.reduce((t, i) => t + i.grams, 0);

  const save = async () => {
    if (!name.trim() || items.length === 0) {
      toast('Нужны название и хотя бы один ингредиент', 'alert', 'var(--c-warn)');
      return;
    }
    const { cookedWeight: _c, ...base } = item ?? ({ kind: 'dish' } as Partial<FoodItem>);
    const row = await saveFood({ ...base, ...per100, kind: 'dish', name: name.trim(), ingredients: items, portion: item?.portion ?? 250, ...(cookedWeight ? { cookedWeight } : {}) });
    onSaved?.(row);
    onClose();
  };

  return (
    <Modal keepOnOutsideClick open onClose={onClose} title={item ? 'Моё блюдо' : 'Новое блюдо'} accent="var(--c-food)" footer={
      <>
        <DeleteButton item={item} onDone={onClose} />
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="primary" onClick={() => void save()}>Сохранить</Button>
      </>
    }>
      <TextInput label="Название" value={name} maxLength={80} placeholder="Курица с гречкой" onChange={(e) => setName(e.target.value)} data-autofocus />
      <div className={s.label}>Ингредиенты</div>
      <ul className={s.foods}>
        {items.map((it, i) => (
          <li key={`${it.name}-${String(i)}`} className={s.ingredient}>
            <span className={s.grow}>{it.name}</span>
            <input
              className={s.gramsCell}
              inputMode="decimal"
              aria-label={`Граммы: ${it.name}`}
              defaultValue={it.grams}
              onBlur={(e) => {
                const g = parseValue(e.target.value);
                if (g) setItems((xs) => xs.map((x, j) => (j === i ? { ...x, grams: g } : x)));
                else e.target.value = String(it.grams);
              }}
            />
            <span className={s.dim}>г</span>
            <Button small variant="ghost" icon="close" label="Убрать" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} />
          </li>
        ))}
      </ul>
      <Button icon="plus" onClick={() => setPicking(true)}>
        Ингредиент
      </Button>
      <TextInput label="Вес готового блюда, г" inputMode="decimal" value={cooked} placeholder={raw ? `${String(raw)} — сумма ингредиентов` : 'Необязательно'} onChange={(e) => setCooked(e.target.value)} />
      <p className={s.total}>
        На 100 г: <b>{per100.kcal} ккал</b> <span className={s.dim}>{macroLine(per100)}</span>
      </p>
      <Modal keepOnOutsideClick open={picking} onClose={() => setPicking(false)} title="Ингредиент" accent="var(--c-food)">
        {picking && (
          <FoodSearch
            date={date}
            meal={meal}
            onPick={({ name: n, kcal, protein, fat, carbs, lastGrams, portion }) => {
              setItems((xs) => [...xs, { name: n, grams: lastGrams ?? portion ?? 100, kcal, protein, fat, carbs }]);
              setPicking(false);
            }}
          />
        )}
      </Modal>
    </Modal>
  );
}
