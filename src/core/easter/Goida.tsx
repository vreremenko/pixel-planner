/*
 * Шуточная пасхалка: маленький флаг в правом нижнем углу (только на компьютере), по нажатию — «ГОЙДА!!!» со звуком.
 * Временная: чтобы убрать, удалите эту папку и <Goida /> в src/core/shell/Layout.tsx.
 */
import { useEffect, useRef, useState } from 'react';
import s from './Goida.module.css';
import goidaUrl from './goida.mp3';

/** Запасной звук, если файл не проигрался: короткий 8-битный «крик»: пила, которая падает по высоте, плюс шумовой удар. */
function yell() {
  try {
    const ctx = new AudioContext();
    const t = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    gain.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(190, t + 1);
    osc.connect(gain);
    osc.start(t);
    osc.stop(t + 1.1);
    // «Г-О-Й-Д-А» — пять коротких толчков громкости
    for (let i = 1; i < 5; i++) {
      gain.gain.setValueAtTime(0.22, t + 0.18 * i);
      gain.gain.exponentialRampToValueAtTime(0.06, t + 0.18 * i + 0.1);
    }
    setTimeout(() => void ctx.close(), 1500);
  } catch {
    // Аудио недоступно — остаётся только картинка
  }
}

export function Goida() {
  const [shown, setShown] = useState(false);
  const timer = useRef<number>(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const fire = () => {
    window.clearTimeout(timer.current);
    setShown(true);
    const audio = new Audio(goidaUrl);
    audio.play().catch(yell);
    timer.current = window.setTimeout(() => setShown(false), 1800);
  };

  return (
    <>
      <button type="button" className={s.secret} onClick={fire} aria-label="Секретная кнопка" tabIndex={-1}>
        <span className={s.flagWhite} />
        <span className={s.flagBlue} />
        <span className={s.flagRed} />
      </button>
      {shown && (
        <div className={s.overlay} role="status" aria-live="assertive">
          <span className={s.text}>ГОЙДА!!!</span>
        </div>
      )}
    </>
  );
}
