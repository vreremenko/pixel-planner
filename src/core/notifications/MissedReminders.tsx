import { useLiveQuery } from 'dexie-react-hooks';
import { Button, Panel, PixelIcon } from '../ui';
import { reminderLogRepo } from '../data/repo';
import { completeReminder, reminderOpenPath } from '../../modules/reminders';
import { INFO_KIND } from './types';
import { formatDateShort } from '../domain/dates';

/** Напоминания, сработавшие, пока приложение было закрыто, — показываем внутри интерфейса. */
export function MissedReminders() {
  const missed = useLiveQuery(() => reminderLogRepo.unacknowledged(Date.now()), []);
  if (!missed || missed.length === 0) return null;
  const sorted = [...missed].sort((a, b) => a.fireAt - b.fireAt);
  return (
    <Panel
      title={`Пропущенные напоминания: ${missed.length}`}
      icon="alert"
      accent="var(--c-warn)"
      role="region"
      aria-live="polite"
      actions={
        <Button small onClick={() => void reminderLogRepo.acknowledge(missed.map((m) => m.key))}>
          Понятно
        </Button>
      }
      style={{ marginBottom: 24 }}
    >
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sorted.slice(0, 8).map((r) => {
          const at = new Date(r.fireAt);
          return (
            <li key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <PixelIcon name="bell" size={16} />
              <span className="digits" style={{ color: 'var(--c-text-dim)' }}>
                {formatDateShort(r.date)} {at.toTimeString().slice(0, 5)}
              </span>
              <span style={{ flex: 1, minWidth: 120 }}>{r.title}</span>
              {r.kind !== INFO_KIND && (
                <Button
                  small
                  variant="ghost"
                  icon="check"
                  label="Отметить выполненным"
                  onClick={() =>
                    void completeReminder(r)
                      .then(async (done) => {
                        await reminderLogRepo.acknowledge([r.key]);
                        // Отметить из списка нельзя (например, нужно число) — открываем раздел
                        if (!done) location.hash = `#${reminderOpenPath(r)}`;
                      })
                  }
                />
              )}
              <Button small variant="ghost" icon="close" label="Скрыть" onClick={() => void reminderLogRepo.acknowledge([r.key])} />
            </li>
          );
        })}
      </ul>
      {sorted.length > 8 && <p style={{ margin: '8px 0 0', color: 'var(--c-text-dim)' }}>…и ещё {sorted.length - 8}</p>}
    </Panel>
  );
}
