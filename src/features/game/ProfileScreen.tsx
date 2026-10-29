import { useMemo } from 'react';
import s from './Game.module.css';
import { Panel, PixelIcon, cx } from '../../ui';
import { useAllTasks, useHabitLogs, useUnlocked, useXpTotal } from '../../data/hooks';
import { levelFromXp } from '../../domain/xp';
import { ACHIEVEMENTS } from '../../domain/achievements';
import { ProgressBar } from '../../charts/ProgressBar';
import { fs } from '../../ui/fs';

const TITLES = ['Новичок', 'Оруженосец', 'Странник', 'Рыцарь', 'Ветеран', 'Чемпион', 'Герой', 'Легенда'];

export function ProfileScreen() {
  const total = useXpTotal();
  const lv = levelFromXp(total);
  const unlocked = useUnlocked();
  const tasks = useAllTasks();
  const logs = useHabitLogs();
  const unlockedMap = useMemo(() => new Map((unlocked ?? []).map((u) => [u.achievementId, u.unlockedAt])), [unlocked]);
  const rank = TITLES[Math.min(TITLES.length - 1, Math.floor((lv.level - 1) / 2))] ?? '';

  return (
    <>
      <h1 className="glow" style={{ color: 'var(--c-xp)', marginBottom: 16 }}>
        Персонаж
      </h1>
      <Panel accent="var(--c-xp)" style={{ marginBottom: 24 }}>
        <div className={s.hero}>
          <div className={s.avatar}>
            <PixelIcon name="player" size={64} />
          </div>
          <div className={s.heroInfo}>
            <div className={s.level}>LV {lv.level}</div>
            <div style={{ color: 'var(--c-text-dim)', marginBottom: 8 }}>{rank}</div>
            <ProgressBar value={lv.into / lv.span} label="Опыт до следующего уровня" height={16} />
            <div className="digits" style={{ marginTop: 6, fontSize: fs(20) }}>
              {lv.into} / {lv.span} XP · всего {lv.total}
            </div>
          </div>
          <div className="digits" style={{ fontSize: fs(20), color: 'var(--c-text-dim)' }}>
            <div>Задач закрыто: <b style={{ color: 'var(--c-task)' }}>{tasks?.filter((t) => t.done).length ?? 0}</b></div>
            <div>Отметок квестов: <b style={{ color: 'var(--c-habit)' }}>{logs?.length ?? 0}</b></div>
            <div>Достижений: <b style={{ color: 'var(--c-xp)' }}>{unlockedMap.size}/{ACHIEVEMENTS.length}</b></div>
          </div>
        </div>
      </Panel>
      <Panel title="Достижения" icon="trophy" accent="var(--c-xp)">
        <ul className={s.achGrid}>
          {ACHIEVEMENTS.map((a) => {
            const at = unlockedMap.get(a.id);
            return (
              <li key={a.id} className={cx(s.ach, at !== undefined && s.unlocked)} aria-label={`${a.title}: ${a.description}. ${at ? 'Получено' : 'Закрыто'}`}>
                <div className={s.achIcon}>
                  <PixelIcon name={at ? a.icon : 'lock'} size={32} />
                </div>
                <div>
                  <div className={s.achTitle} style={{ color: at ? 'var(--c-xp)' : 'var(--c-text-dim)' }}>
                    {a.title}
                  </div>
                  <div className={s.achDesc}>{a.description}</div>
                  {at && <div className={s.achDesc}>{new Date(at).toLocaleDateString('ru-RU')}</div>}
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
    </>
  );
}
