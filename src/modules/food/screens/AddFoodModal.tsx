/* Добавление в приём пищи: поиск → граммовка → запись. Окно остаётся открытым: обычно добавляют несколько продуктов. */
import { useCallback, useState } from 'react';
import { Button, Modal, toast } from '../../../core/ui';
import type { LocalDate } from '../../../core/domain/types';
import { macroLine } from '../domain/logic';
import { MEALS, type FoodItem, type Meal } from '../domain/types';
import { addEntry } from '../services/entries';
import { lookupBarcode } from '../services/off';
import { BarcodeScanner } from './BarcodeScanner';
import { DishEditor, ProductEditor } from './FoodEditors';
import { FoodSearch, type Picked } from './FoodSearch';
import { PortionForm } from './PortionForm';
import s from './Food.module.css';

export function AddFoodModal({ date, meal, onClose }: { date: LocalDate; meal: Meal; onClose: () => void }) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [editor, setEditor] = useState<{ kind: 'product' | 'dish'; item?: FoodItem } | null>(null);
  const [scanning, setScanning] = useState(false);
  // Код со сканера ищем в Open Food Facts: нашли — сразу к граммовке, нет — вводим КБЖУ с упаковки
  const onCode = useCallback((code: string) => {
    setScanning(false);
    const ctrl = new AbortController();
    toast(`Ищем ${code}…`, 'search', 'var(--c-food)');
    lookupBarcode(code, ctrl.signal).then(
      (food) => {
        if (food) setPicked(food);
        else {
          toast('Этого штрихкода нет в Open Food Facts — введите КБЖУ с упаковки', 'alert', 'var(--c-warn)');
          setEditor({ kind: 'product' });
        }
      },
      () => toast('Поиск по штрихкоду сейчас недоступен — попробуйте позже', 'alert', 'var(--c-warn)'),
    );
  }, []);
  const label = MEALS.find((m) => m.id === meal)?.label ?? '';

  const add = async (grams: number) => {
    if (!picked) return;
    await addEntry(date, meal, picked, grams);
    toast(`${picked.name}: ${String(grams)} г`, 'check', 'var(--c-food)');
    setPicked(null);
  };

  return (
    <Modal keepOnOutsideClick open onClose={onClose} title={`Добавить: ${label.toLowerCase()}`} accent="var(--c-food)">
      {picked ? (
        <>
          <p className={s.pickedName}>
            {picked.name}
            {picked.brand ? ` · ${picked.brand}` : ''}
            <br />
            <span className={s.dim}>
              {picked.kcal} ккал · {macroLine(picked)} на 100 г
            </span>
          </p>
          <PortionForm key={picked.id} food={picked} grams={picked.lastGrams ?? picked.portion ?? 100} action="Добавить" onSubmit={(g) => void add(g)} />
          <div className={s.below}>
            <Button variant="ghost" icon="left" onClick={() => setPicked(null)}>
              К поиску
            </Button>
          </div>
        </>
      ) : (
        <>
          <FoodSearch
            date={date}
            meal={meal}
            onPick={setPicked}
            onEdit={(item) => setEditor({ kind: item.kind, item })}
            onScan={() => setScanning(true)}
            onNewProduct={() => setEditor({ kind: 'product' })}
            onNewDish={() => setEditor({ kind: 'dish' })}
          />
          <p className={s.credit}>
            Магазинные продукты: <a href="https://openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a>, лицензия ODbL. Значения справочника усреднённые.
          </p>
        </>
      )}
      {scanning && <BarcodeScanner onCode={onCode} onClose={() => setScanning(false)} />}
      {editor?.kind === 'product' && <ProductEditor item={editor.item} onClose={() => setEditor(null)} onSaved={setPicked} />}
      {editor?.kind === 'dish' && <DishEditor item={editor.item} date={date} meal={meal} onClose={() => setEditor(null)} onSaved={setPicked} />}
    </Modal>
  );
}
