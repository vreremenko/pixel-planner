/*
 * «Категории»: свои категории доходов и расходов — добавить, переименовать, переставить, удалить.
 * Открывается из окна операции («Изменить категории») и из настроек финансов.
 * При удалении операции и платежи категории переезжают в «Другое»; саму «Другое» удалить нельзя.
 */
import { useState } from 'react';
import { Button, ConfirmDialog, Modal, Segmented, cx, inputClass, toast } from '../../../core/ui';
import { useCategories, usePayments, useTxs } from '../data/hooks';
import { categoryRepo } from '../data/repo';
import { OTHER_ID, canDelete, deletionMoves, movesText, nextOrder, visibleCategories } from '../domain/categories';
import type { Category, CategoryKind } from '../domain/types';
import s from './Finance.module.css';

const KINDS: readonly { value: CategoryKind; label: string }[] = [
  { value: 'expense', label: 'Расходы' },
  { value: 'income', label: 'Доходы' },
];

function Row({ c, i, count, onDelete }: { c: Category; i: number; count: number; onDelete: (c: Category) => void }) {
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
        {canDelete(c) ? (
          <Button small variant="ghost" icon="trash" label={`Удалить: ${c.name}`} onClick={() => onDelete(c)} />
        ) : (
          // «Другое» не удаляется: сюда переезжают операции удалённых категорий
          <Button small variant="ghost" icon="lock" label={`«${c.name}» удалить нельзя: сюда переносятся операции удалённых категорий`} disabled />
        )}
      </div>
    </li>
  );
}

export function CategoriesModal({ kind: initial, onClose }: { kind?: CategoryKind; onClose: () => void }) {
  const all = useCategories();
  const [kind, setKind] = useState<CategoryKind>(initial ?? 'expense');
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState<Category | null>(null);
  const txs = useTxs();
  const payments = usePayments();
  if (!all || !txs || !payments) return null;
  const moves = deleting ? deletionMoves(deleting, txs, payments) : null;
  const other = all.find((c) => c.id === OTHER_ID[kind]);
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
      <p className={s.hint}>
        В этом порядке категории стоят в окне записи {kind === 'expense' ? 'расхода' : 'дохода'}. Название меняется прямо в строке. Операции удалённой категории переходят в «{other?.name ?? 'Другое'}».
      </p>
      <ul className={s.list}>
        {list.map((c, i) => (
          <Row key={c.id} c={c} i={i} count={list.length} onDelete={setDeleting} />
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
          <p className={s.hint}>Скрытые в прошлых версиях: их можно вернуть или удалить.</p>
          <ul className={s.list}>
            {hidden.map((c) => (
              <li key={c.id} className={s.line}>
                <span className={s.grow}>{c.name}</span>
                <Button small onClick={() => void categoryRepo.save({ ...c, archived: false, order: nextOrder(all, kind) })}>
                  Вернуть
                </Button>
                {canDelete(c) && <Button small variant="ghost" icon="trash" label={`Удалить: ${c.name}`} onClick={() => setDeleting(c)} />}
              </li>
            ))}
          </ul>
        </details>
      )}
      <ConfirmDialog
        open={deleting !== null}
        title={`Удалить «${deleting?.name ?? ''}»?`}
        action="Удалить"
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          const what = moves ? movesText(moves) : '';
          void categoryRepo.remove(deleting.id).then(() => toast(what ? `Удалено, ${what} — в «${other?.name ?? 'Другое'}»` : 'Категория удалена', 'check', 'var(--c-fin)'));
        }}
      >
        {moves && (moves.txs.length || moves.payments.length) ? `${movesText(moves)} перейдут в категорию «${other?.name ?? 'Другое'}». Суммы и балансы не изменятся.` : 'Операций с этой категорией нет.'}
      </ConfirmDialog>
    </Modal>
  );
}
