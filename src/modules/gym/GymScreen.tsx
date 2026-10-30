import { ComingSoon } from '../../core/shell/ComingSoon';

export function GymScreen() {
  return (
    <ComingSoon title="Тренировки" icon="dumbbell" accent="var(--c-gym)">
      <p style={{ margin: 0 }}>План тренировок, подходы, повторения и вес, графики прогресса.</p>
    </ComingSoon>
  );
}

export function GymWidget() {
  return <p style={{ margin: 0, color: 'var(--c-text-dim)' }}>Раздел в разработке. Здесь будет сегодняшняя тренировка и последние результаты.</p>;
}
