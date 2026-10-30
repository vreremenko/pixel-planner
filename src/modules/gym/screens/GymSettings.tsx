/* Настройки раздела в «Настройках»: что включено в тренировках. Общие для всех устройств аккаунта. */
import { Field, Panel, Segmented } from '../../../core/ui';
import { ToggleRow } from '../../../core/settings/ToggleRow';
import { usePrefs } from '../data/hooks';
import { prefsRepo } from '../data/repo';

const REST = [60, 90, 120, 180].map((v) => ({ value: String(v), label: v < 120 ? `${String(v)} с` : `${String(v / 60)} мин` }));

export function GymSettings() {
  const prefs = usePrefs();
  if (!prefs) return null;
  return (
    <Panel title="Тренировки" icon="dumbbell" accent="var(--c-gym)">
      <ToggleRow
        label="Таймер отдыха"
        hint="После отметки подхода запускается отсчёт; в конце — звук и вибрация"
        checked={prefs.restTimer.on}
        onChange={(on) => void prefsRepo.patch({ restTimer: { ...prefs.restTimer, on } })}
        color="var(--c-gym)"
      />
      {prefs.restTimer.on && (
        <Field label="Отдых по умолчанию">
          <Segmented value={String(prefs.restTimer.sec)} options={REST} onChange={(v) => void prefsRepo.patch({ restTimer: { ...prefs.restTimer, sec: Number(v) } })} label="Отдых по умолчанию" />
        </Field>
      )}
      <ToggleRow
        label="Оценка тяжести (RPE)"
        hint="После подхода можно указать, насколько тяжело он дался: 1–10"
        checked={prefs.rpe}
        onChange={(rpe) => void prefsRepo.patch({ rpe })}
        color="var(--c-gym)"
      />
    </Panel>
  );
}
