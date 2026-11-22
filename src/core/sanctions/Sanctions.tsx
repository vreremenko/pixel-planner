/*
 * Шутка для своих: админ включает человеку «санкции» в админке — и каждое нажатие в меню звучит неприлично,
 * а при первом открытии показывается официальное уведомление. Снял галочку — всё прошло.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/store';
import { Button, Modal } from '../ui';

const SEEN_KEY = 'pp-sanctions-seen';
let ctx: AudioContext | null = null;

/** Синтез: низкий «бррр» с дрожанием высоты и шумом, ~0,7 секунды. */
function fart(): void {
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime + 0.01;
    const len = 0.55 + Math.random() * 0.35;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.35, t + 0.04);
    out.gain.setValueAtTime(0.3, t + len * 0.7);
    out.gain.exponentialRampToValueAtTime(0.0001, t + len);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 6;
    filter.connect(out);
    out.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const base = 70 + Math.random() * 30;
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.linearRampToValueAtTime(base * 0.75, t + len);
    // Дрожание — то самое «бррр»
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 18 + Math.random() * 10;
    const depth = ctx.createGain();
    depth.gain.value = base * 0.45;
    wobble.connect(depth).connect(osc.frequency);
    osc.connect(filter);

    // Немного шума для фактуры
    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.25;
    noise.buffer = buf;
    noise.connect(filter);

    for (const node of [osc, wobble, noise]) {
      node.start(t);
      node.stop(t + len);
    }
  } catch {
    // Без звука санкции не действуют — и ладно
  }
}

const read = () => {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true;
  }
};
const write = (seen: boolean) => {
  try {
    if (seen) localStorage.setItem(SEEN_KEY, '1');
    else localStorage.removeItem(SEEN_KEY);
  } catch {
    // ничего страшного
  }
};

export function Sanctions() {
  const on = useAuth((s) => Boolean(s.session?.user.sanctions));
  // Уведомление — один раз; новое введение санкций покажет его снова (при следующем открытии)
  const [seen, setSeen] = useState(read);

  useEffect(() => {
    if (!on) {
      // Сняли санкции — при следующем введении уведомление покажется снова
      write(false);
      return;
    }
    const onClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target.closest('nav a, nav button') : null;
      if (el) fart();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [on]);

  if (!on || seen) return null;
  const close = () => {
    write(true);
    setSeen(true);
    fart();
  };
  return (
    <Modal
      open
      onClose={close}
      title="Важное обновление"
      accent="var(--c-warn)"
      footer={
        <Button variant="danger" onClick={close}>
          Принимаю санкции
        </Button>
      }
    >
      <p style={{ marginTop: 0 }}>
        <b>v0.43.1-санкции</b> · только для вашего аккаунта
      </p>
      <ul style={{ paddingLeft: 20 }}>
        <li>В связи с оскорблением разработчика в обратной связи администрация признала ваши действия недопустимыми.</li>
        <li>К вашему аккаунту применены санкции: каждое нажатие в меню теперь сопровождается звуком, соответствующим тяжести проступка.</li>
        <li>Санкции действуют до принесения официальных извинений разработчику. Обжалованию не подлежат.</li>
      </ul>
    </Modal>
  );
}
