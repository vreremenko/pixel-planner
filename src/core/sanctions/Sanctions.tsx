/*
 * Шутка для своих: админ включает человеку «санкции» в админке — и каждое нажатие в меню звучит неприлично,
 * а при первом открытии показывается официальное уведомление. Снял галочку — всё прошло.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/store';
import { Button, Modal } from '../ui';
import { fartSamples } from './fartSound';

const SEEN_KEY = 'pp-sanctions-seen';

let ctx: AudioContext | null = null;

function fart(): void {
  try {
    ctx ??= new AudioContext();
    const data = fartSamples(ctx.sampleRate);
    const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buf.getChannelData(0).set(data);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = 0.6;
    src.connect(gain).connect(ctx.destination);
    src.start();
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
