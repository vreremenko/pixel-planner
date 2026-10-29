import { useEffect, type CSSProperties } from 'react';
import s from './Game.module.css';
import { useGame, type GameEvent } from '../../stores/game';
import { Button, Panel, PixelIcon, toast } from '../../ui';
import { achievementById } from '../../services/game';
import { lockScroll, unlockScroll } from '../../ui/scrollLock';
import { isIconName } from '../../ui/icons';
import { fs } from '../../ui/fs';

function XpPop({ ev }: { ev: Extract<GameEvent, { type: 'xp' }> }) {
  const consume = useGame((st) => st.consume);
  useEffect(() => {
    const t = setTimeout(() => consume(ev.id), 1200);
    return () => clearTimeout(t);
  }, [ev.id, consume]);
  return (
    <>
      <div className={s.xpFloat} aria-hidden>
        +{ev.amount} XP
      </div>
      <div className={s.sparks} aria-hidden>
        {[...Array(8).keys()].map((i) => {
          const a = (i / 8) * Math.PI * 2;
          return <span key={i} className={s.spark} style={{ '--dx': `${Math.round(Math.cos(a) * 36)}px`, '--dy': `${Math.round(Math.sin(a) * 36)}px` } as CSSProperties} />;
        })}
      </div>
    </>
  );
}

function LevelUp({ ev }: { ev: Extract<GameEvent, { type: 'levelup' }> }) {
  const consume = useGame((st) => st.consume);
  const close = () => consume(ev.id);
  useEffect(() => {
    lockScroll();
    return unlockScroll;
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <div className={s.overlay} role="alertdialog" aria-label={`Новый уровень ${ev.level}`} onClick={close}>
      <Panel accent="var(--c-xp)" className={s.levelCard}>
        <PixelIcon name="crown" size={64} />
        <h2 className="glow">LEVEL UP!</h2>
        <p style={{ fontSize: fs(24), margin: '0 0 16px' }}>Уровень {ev.level}</p>
        <Button variant="xp" onClick={close} autoFocus>
          Продолжить
        </Button>
        <p className={s.blink}>PRESS START</p>
      </Panel>
    </div>
  );
}

/** Визуальные эффекты игровых событий: +XP, новый уровень, достижения. */
export function GameFx() {
  const events = useGame((st) => st.events);
  const consume = useGame((st) => st.consume);

  useEffect(() => {
    for (const ev of events) {
      if (ev.type !== 'achievement') continue;
      const a = achievementById(ev.achievementId);
      if (a) toast(`Достижение: ${a.title}! +50 XP`, isIconName(a.icon) ? a.icon : 'trophy', 'var(--c-xp)');
      consume(ev.id);
    }
  }, [events, consume]);

  const xp = events.filter((e): e is Extract<GameEvent, { type: 'xp' }> => e.type === 'xp').at(-1);
  const lvl = events.find((e): e is Extract<GameEvent, { type: 'levelup' }> => e.type === 'levelup');
  return (
    <>
      {xp && <XpPop key={xp.id} ev={xp} />}
      {lvl && <LevelUp ev={lvl} />}
    </>
  );
}
