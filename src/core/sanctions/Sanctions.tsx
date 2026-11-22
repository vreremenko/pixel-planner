/*
 * Шутка для своих: админ включает человеку «санкции» в админке — и каждое нажатие в меню звучит неприлично,
 * а при первом открытии показывается официальное уведомление. Снял галочку — всё прошло.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/store';
import { Button, Modal } from '../ui';
import fartUrl from './fart.wav';

const SEEN_KEY = 'pp-sanctions-seen';

/**
 * Звук — запись (файл прислал автор), а не синтез. Играем через Web Audio: политика безопасности сайта не пускает
 * <audio>, а загрузка файла с нашего же адреса разрешена. Файл грузим один раз.
 */
let ctx: AudioContext | null = null;
let buffer: Promise<AudioBuffer | null> | null = null;

function fart(): void {
  try {
    ctx ??= new AudioContext();
    const c = ctx;
    buffer ??= fetch(fartUrl)
      .then((r) => r.arrayBuffer())
      .then((data) => c.decodeAudioData(data))
      .catch(() => null);
    void buffer.then((b) => {
      if (!b) return;
      const src = c.createBufferSource();
      src.buffer = b;
      // Чуть разная высота — каждый раз звучит по-своему
      src.playbackRate.value = 0.85 + Math.random() * 0.3;
      src.connect(c.destination);
      src.start();
    });
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
