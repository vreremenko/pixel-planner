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
  // Файл загружаем и расшифровываем заранее: в Safari звук нужно запускать прямо из нажатия, ждать загрузку там нельзя
  const audio = useRef<{ ctx: AudioContext; buffer: AudioBuffer | null } | null>(null);

  useEffect(() => {
    let alive = true;
    try {
      const ctx = new AudioContext();
      audio.current = { ctx, buffer: null };
      void fetch(goidaUrl)
        .then((r) => r.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .then((buffer) => {
          if (alive && audio.current) audio.current.buffer = buffer;
        })
        .catch(() => undefined);
    } catch {
      // Нет Web Audio — запасной звук ниже
    }
    return () => {
      alive = false;
      window.clearTimeout(timer.current);
    };
  }, []);

  /** Настоящий крик из файла; если не вышло — тот же файл через <audio>, а в крайнем случае синтезированный. */
  const sound = () => {
    const a = audio.current;
    if (a?.buffer) {
      try {
        void a.ctx.resume();
        const src = a.ctx.createBufferSource();
        src.buffer = a.buffer;
        src.connect(a.ctx.destination);
        src.start();
        return;
      } catch {
        // пробуем дальше
      }
    }
    new Audio(goidaUrl).play().catch(yell);
  };

  const fire = () => {
    window.clearTimeout(timer.current);
    setShown(true);
    sound();
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
