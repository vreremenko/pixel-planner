/* Дневник дня: калории и БЖУ против цели, четыре приёма пищи, запись и правка еды. */
import { useState } from 'react';
import { Button, ConfirmDialog, Modal, Panel, cx, useSwipe } from '../../../core/ui';
import { TopbarActions } from '../../../core/shell/TopbarActions';
import { useToday } from '../../../core/shell/useToday';
import { addDays, formatDateDay } from '../../../core/domain/dates';
import { useDayEntries, useFoodPrefs } from '../data/hooks';
import { portionOf, sumEntries } from '../domain/logic';
import { MEALS, type FoodEntry, type Meal } from '../domain/types';
import { copyMeal, removeEntry, setGrams } from '../services/entries';
import { AddFoodModal } from './AddFoodModal';
import { Bars } from './Bars';
import { GoalsModal } from './GoalsModal';
import { PortionForm } from './PortionForm';
import s from './Food.module.css';

function EntryRow({ entry, onOpen, onDelete }: { entry: FoodEntry; onOpen: () => void; onDelete: () => void }) {
  const swipe = useSwipe({ onLeft: onDelete });
  return (
    <li className={s.entry}>
      <div aria-hidden className={cx(s.swipeBg, swipe.pastThreshold && s.swipeReady)} style={{ opacity: swipe.dx < 0 ? 1 : 0 }}>
        Удалить
      </div>
      <button type="button" className={s.entryBtn} style={swipe.rowStyle} onClick={onOpen} {...swipe.bind}>
        <span className={s.grow}>
          {entry.name}
          <br />
          <span className={s.dim}>{entry.grams} г</span>
        </span>
        <span className={s.dim}>{portionOf(entry, entry.grams).kcal}</span>
      </button>
    </li>
  );
}

export function FoodDiary() {
  const todayDate = useToday();
  const [picked, setDate] = useState<string | null>(null);
  const date = picked ?? todayDate;
  const entries = useDayEntries(date);
  const yesterday = useDayEntries(addDays(date, -1));
  const prefs = useFoodPrefs();
  const [adding, setAdding] = useState<Meal | null>(null);
  const [editing, setEditing] = useState<FoodEntry | null>(null);
  const [deleting, setDeleting] = useState<FoodEntry | null>(null);
  const [goals, setGoals] = useState(false);
  if (!entries || !yesterday || !prefs) return null;

  return (
    <>
      <div className={s.head}>
        <h1 className="glow pageTitle" style={{ color: 'var(--c-food)' }}>
          Питание
        </h1>
        <TopbarActions>
          <Button small onClick={() => setGoals(true)}>
            Цель
          </Button>
        </TopbarActions>
      </div>
      <div className={s.dateNav}>
        <Button small variant="ghost" icon="left" label="Предыдущий день" onClick={() => setDate(addDays(date, -1))} />
        <button type="button" className={s.dateLabel} onClick={() => setDate(null)}>
          {formatDateDay(date)}
          {date === todayDate ? ' · сегодня' : ''}
        </button>
        <Button small variant="ghost" icon="right" label="Следующий день" onClick={() => setDate(addDays(date, 1))} />
      </div>
      <div className={s.stack}>
        <Panel title="Итог дня" icon="apple" accent="var(--c-food)">
          <Bars eaten={sumEntries(entries)} goal={prefs.goal} />
          {!prefs.goal && (
            <div className={s.below}>
              <Button small variant="primary" onClick={() => setGoals(true)}>
                Задать цель
              </Button>
            </div>
          )}
        </Panel>
        {MEALS.map(({ id, label }) => {
          const mine = entries.filter((e) => e.meal === id);
          const before = yesterday.filter((e) => e.meal === id);
          return (
            <Panel
              key={id}
              title={label}
              accent="var(--c-food)"
              actions={
                <>
                  <span className={s.dim}>{sumEntries(mine).kcal} ккал</span>
                  <Button small icon="plus" label={`Добавить: ${label}`} onClick={() => setAdding(id)} />
                </>
              }
            >
              {mine.length > 0 ? (
                <ul className={s.foods}>
                  {mine.map((e) => (
                    <EntryRow key={e.id} entry={e} onOpen={() => setEditing(e)} onDelete={() => setDeleting(e)} />
                  ))}
                </ul>
              ) : before.length > 0 ? (
                <Button small variant="ghost" icon="plus" onClick={() => void copyMeal(before, date)}>
                  Как вчера: {sumEntries(before).kcal} ккал
                </Button>
              ) : null}
            </Panel>
          );
        })}
      </div>
      {adding && <AddFoodModal date={date} meal={adding} onClose={() => setAdding(null)} />}
      {goals && <GoalsModal prefs={prefs} onClose={() => setGoals(false)} />}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        keepOnOutsideClick
        title={editing?.name ?? ''}
        accent="var(--c-food)"
      >
        {editing && (
          <>
            <PortionForm
              key={editing.id}
              food={editing}
              grams={editing.grams}
              action="Сохранить"
              onSubmit={(g) => {
                void setGrams(editing, g);
                setEditing(null);
              }}
            />
            <div className={s.below}>
              <Button
                variant="ghost"
                icon="trash"
                onClick={() => {
                  setDeleting(editing);
                  setEditing(null);
                }}
              >
                Удалить запись
              </Button>
            </div>
          </>
        )}
      </Modal>
      <ConfirmDialog open={deleting !== null} title="Удалить запись?" onClose={() => setDeleting(null)} onConfirm={() => deleting && void removeEntry(deleting.id)}>
        «{deleting?.name}» пропадёт из этого дня.
      </ConfirmDialog>
    </>
  );
}
