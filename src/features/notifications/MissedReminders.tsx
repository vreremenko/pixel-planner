import { useLiveQuery } from 'dexie-react-hooks';
import { Button, Panel, PixelIcon } from '../../ui';
import { reminderLogRepo } from '../../data/repo';
import { completeFromReminder } from '../../data/quickActions';
import { formatDateShort } from '../../domain/dates';
import { checkAchievements } from '../../services/game';

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
              {r.kind !== 'summary' && (
                <Button
                  small
                  variant="ghost"
                  icon="check"
                  label="Отметить выполненным"
                  onClick={() =>
                    void completeFromReminder(r)
                      .then(async (done) => {
                        await reminderLogRepo.acknowledge([r.key]);
                        // Счётная привычка: число вводят на экране квестов
                        if (!done) location.hash = '#/habits';
                      })
                      .then(checkAchievements)
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
