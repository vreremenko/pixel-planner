import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

/** Камера + поиск QR-кода в кадре. Вызывает onText для каждого найденного кода (повторы фильтрует вызывающий). */
export function QrScanner({ onText }: { onText: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(true);
  const cb = useRef(onText);
  useEffect(() => {
    cb.current = onText;
  });

  useEffect(() => {
    let stream: MediaStream | undefined;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement('canvas');

    const start = async () => {
      // В небезопасном контексте (http) браузер не даёт доступ к камере
      const devices = (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
      if (!devices) throw new Error('Камера недоступна в этом браузере');
      // Сначала камера: запрос доступа должен идти сразу после нажатия, а библиотека догрузится следом
      const s = await Promise.race([
        devices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Камера не ответила за 15 секунд')), 15_000)),
      ]);
      stream = s;
      if (stopped) {
        for (const t of s.getTracks()) t.stop();
        return;
      }
      const v = video.current;
      if (!v) return;
      v.srcObject = s;
      await v.play();
      setWaiting(false);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      let last = 0;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        if (!ctx || now - last < 150 || v.videoWidth === 0) return;
        last = now;
        // Уменьшаем кадр: распознавание быстрее, а для QR хватает и 640 пикселей
        const scale = Math.min(1, 640 / v.videoWidth);
        canvas.width = Math.round(v.videoWidth * scale);
        canvas.height = Math.round(v.videoHeight * scale);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (code?.data) cb.current(code.data);
      };
      raf = requestAnimationFrame(loop);
    };

    start().catch((e: unknown) => {
      const name = e instanceof DOMException ? e.name : '';
      setError(
        name === 'NotAllowedError'
          ? 'Нет доступа к камере. Разрешите его в настройках браузера или введите код вручную.'
          : name === 'NotFoundError'
            ? 'Камера не найдена. Введите код вручную.'
            : e instanceof Error
              ? `Не удалось включить камеру: ${e.message}`
              : 'Не удалось включить камеру',
      );
    });

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      for (const t of stream?.getTracks() ?? []) t.stop();
    };
  }, []);

  if (error) return <p role="alert" style={{ color: 'var(--c-warn)', margin: 0 }}>{error}</p>;
  return (
    <>
      <video ref={video} muted playsInline autoPlay aria-label="Камера для сканирования QR-кода" style={{ width: '100%', maxHeight: 320, objectFit: 'cover', background: '#000', display: 'block' }} />
      {waiting && <p style={{ margin: '8px 0 0', color: 'var(--c-text-dim)' }}>Включаем камеру… Если браузер спросит разрешение, нажмите «Разрешить».</p>}
    </>
  );
}
