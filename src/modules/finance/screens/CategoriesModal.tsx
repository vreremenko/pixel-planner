/*
 * «Категории»: свои категории доходов и расходов — добавить, переименовать, переставить, скрыть и вернуть.
 * Открывается из окна операции (плитка «Изменить») и из настроек финансов.
 * Удаления нет намеренно: на категорию ссылаются старые операции, поэтому лишнюю категорию прячут в архив.
 */
import { useState } from 'react';
import { Button, Modal, Segmented, cx, inputClass, toast } from '../../../core/ui';
import { useCategories } from '../data/hooks';
import { categoryRepo } from '../data/repo';
import { nextOrder, visibleCategories } from '../domain/categories';
import type { Category, CategoryKind } from '../domain/types';
import s from './Finance.module.css';

const KINDS: readonly { value: CategoryKind; label: string }[] = [
  { value: 'expense', label: 'Расходы' },
  { value: 'income', label: 'Доходы' },
];

function Row({ c, i, count }: { c: Category; i: number; count: number }) {
  return (
    <li className={s.row}>
      <div className={s.line}>
        <input
          className={cx(inputClass, s.grow)}
          aria-label={`Название: ${c.name}`}
          defaultValue={c.name}
          maxLength={40}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (!v) e.target.value = c.name;
            else if (v !== c.name) void categoryRepo.save({ ...c, name: v });
          }}
        />
        <Button small variant="ghost" icon="up" label={`Выше: ${c.name}`} disabled={i === 0} onClick={() => void categoryRepo.move(c.id, i - 1)} />
        <Button small variant="ghost" icon="down" label={`Ниже: ${c.name}`} disabled={i === count - 1} onClick={() => void categoryRepo.move(c.id, i + 1)} />
        <Button
          small
          variant="ghost"
          icon="close"
          label={`Скрыть: ${c.name}`}
          onClick={() => {
            void categoryRepo.save({ ...c, archived: true });
            toast(`«${c.name}» скрыта — вернуть можно ниже, в «Скрытых»`, 'check', 'var(--c-fin)');
          }}
        />
      </div>
    </li>
  );
}

export function CategoriesModal({ kind: initial, onClose }: { kind?: CategoryKind; onClose: () => void }) {
  const all = useCategories();
  const [kind, setKind] = useState<CategoryKind>(initial ?? 'expense');
  const [name, setName] = useState('');
  if (!all) return null;
  const list = visibleCategories(all, kind);
  const hidden = all.filter((c) => c.kind === kind && c.archived);

  const add = () => {
    const v = name.trim();
    if (!v) return;
    const same = all.find((c) => c.kind === kind && c.name.toLowerCase() === v.toLowerCase());
    if (same && !same.archived) {
      toast(`«${same.name}» уже есть`, 'alert', 'var(--c-warn)');
      return;
    }
    // Такая же скрытая — возвращаем её, а не плодим вторую
    void (same ? categoryRepo.save({ ...same, archived: false, order: nextOrder(all, kind) }) : categoryRepo.save({ name: v, kind, order: nextOrder(all, kind) }));
    setName('');
  };

  return (
    <Modal open onClose={onClose} title="Категории" accent="var(--c-fin)" footer={<Button variant="primary" onClick={onClose}>Готово</Button>}>
      <div style={{ marginBottom: 12 }}>
        <Segmented value={kind} options={KINDS} onChange={setKind} label="Вид категорий" accent="var(--c-fin)" />
      </div>
      <p className={s.hint}>В этом порядке категории стоят в окне записи {kind === 'expense' ? 'расхода' : 'дохода'}. Название меняется прямо в строке.</p>
      <ul className={s.list}>
        {list.map((c, i) => (
          <Row key={c.id} c={c} i={i} count={list.length} />
        ))}
      </ul>
      <form
        className={s.line}
        style={{ marginTop: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input className={cx(inputClass, s.grow)} aria-label="Новая категория" placeholder={kind === 'expense' ? 'Новая категория расходов' : 'Новая категория доходов'} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        <Button small icon="plus" type="submit" label="Добавить категорию" />
      </form>
      {hidden.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: 'pointer' }}>Скрытые ({hidden.length})</summary>
          <p className={s.hint}>Старые операции с ними остаются в истории и статистике.</p>
          <ul className={s.list}>
            {hidden.map((c) => (
              <li key={c.id} className={s.line}>
                <span className={s.grow}>{c.name}</span>
                <Button small onClick={() => void categoryRepo.save({ ...c, archived: false, order: nextOrder(all, kind) })}>
                  Вернуть
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Modal>
  );
}
