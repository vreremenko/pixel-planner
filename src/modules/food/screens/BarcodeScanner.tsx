/*
 * Сканер штрихкода камерой. Где браузер умеет распознавать сам (Chrome на Android), берём встроенный распознаватель;
 * иначе (Safari на iPhone) — запасной на WebAssembly. Его файл лежит на нашем сайте и грузится только при открытии сканера.
 * Камеры нет или доступ запрещён — цифры штрихкода можно ввести руками.
 */
import { useEffect, useRef, useState } from 'react';
import { Button, Modal, TextInput } from '../../../core/ui';
import s from './Food.module.css';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;
const CODE_RE = /^\d{8,14}$/;
const SCAN_EVERY_MS = 250;

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

async function makeDetector(): Promise<Detector> {
  const native = (globalThis as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
  if (native) {
    const supported = await native.getSupportedFormats().catch(() => [] as string[]);
    if (FORMATS.some((f) => supported.includes(f))) return new native({ formats: FORMATS.filter((f) => supported.includes(f)) });
  }
  const [{ BarcodeDetector, prepareZXingModule }, wasm] = await Promise.all([import('barcode-detector/ponyfill'), import('zxing-wasm/reader/zxing_reader.wasm?url')]);
  // Файл распознавателя — со своего сайта, а не с CDN по умолчанию
  await prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasm.default : prefix + path) }, fireImmediately: true });
  return new BarcodeDetector({ formats: [...FORMATS] });
}

function cameraError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError') return 'Нет доступа к камере. Разрешите его в настройках браузера или введите цифры штрихкода ниже.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Камера не найдена. Введите цифры штрихкода ниже.';
  return 'Камера не запустилась. Введите цифры штрихкода ниже.';
}

export function BarcodeScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [typed, setTyped] = useState('');
  const done = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    // Окно могли закрыть, пока ждали камеру: объект, чтобы проверка видела свежее значение
    const run = { live: true };
    const alive = () => run.live;
    const stop = () => {
      clearInterval(timer);
      stream?.getTracks().forEach((t) => {
        t.stop();
      });
    };
    void (async () => {
      try {
        if (!('mediaDevices' in navigator)) throw new DOMException('no camera', 'NotFoundError');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (!alive() || !video.current) return stop();
        video.current.srcObject = stream;
        await video.current.play();
        const detector = await makeDetector();
        if (!alive()) return stop();
        setReady(true);
        let busy = false;
        timer = setInterval(() => {
          const v = video.current;
          if (busy || done.current || !v || v.readyState < 2) return;
          busy = true;
          detector
            .detect(v)
            .then((codes) => {
              const code = codes.map((c) => c.rawValue.trim()).find((c) => CODE_RE.test(c));
              if (code && !done.current) {
                done.current = true;
                if ('vibrate' in navigator) navigator.vibrate(60);
                stop();
                onCode(code);
              }
            })
            .catch(() => undefined)
            .finally(() => {
              busy = false;
            });
        }, SCAN_EVERY_MS);
      } catch (e) {
        if (alive()) setError(cameraError(e));
        stop();
      }
    })();
    return () => {
      run.live = false;
      stop();
    };
  }, [onCode]);

  const manual = typed.replace(/\s/g, '');
  return (
    <Modal open onClose={onClose} title="Штрихкод" accent="var(--c-food)">
      {error ? (
        <p className={s.warn}>{error}</p>
      ) : (
        <>
          <div className={s.scanBox}>
            <video ref={video} className={s.scanVideo} playsInline muted />
            <div className={s.scanFrame} aria-hidden="true" />
          </div>
          <p className={s.hint}>{ready ? 'Наведите камеру на штрихкод на упаковке.' : 'Включаем камеру…'}</p>
        </>
      )}
      <form
        className={s.below}
        onSubmit={(e) => {
          e.preventDefault();
          if (CODE_RE.test(manual)) onCode(manual);
        }}
      >
        <TextInput label="Или цифры под штрихкодом" inputMode="numeric" placeholder="4600000000000" value={typed} maxLength={18} onChange={(e) => setTyped(e.target.value)} />
        <Button type="submit" disabled={!CODE_RE.test(manual)}>
          Найти
        </Button>
      </form>
    </Modal>
  );
}
