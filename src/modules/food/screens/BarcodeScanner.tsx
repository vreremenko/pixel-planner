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

type NativeDetector = { new (o: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> };

/** Встроенный распознаватель браузера (Chrome на Android). */
async function nativeDetector(): Promise<Detector | null> {
  const native = (globalThis as { BarcodeDetector?: NativeDetector }).BarcodeDetector;
  if (!native) return null;
  const supported = await native.getSupportedFormats().catch(() => [] as string[]);
  const formats = FORMATS.filter((f) => supported.includes(f));
  return formats.length ? new native({ formats }) : null;
}

/** Распознаватель на WebAssembly; файл — со своего сайта. Проверяем пробным кадром: на части iPhone он не запускается. */
async function wasmDetector(): Promise<Detector> {
  const [{ BarcodeDetector, prepareZXingModule }, wasm] = await Promise.all([import('barcode-detector/ponyfill'), import('zxing-wasm/reader/zxing_reader.wasm?url')]);
  await prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasm.default : prefix + path) }, fireImmediately: true });
  const d = new BarcodeDetector({ formats: [...FORMATS] });
  const probe = document.createElement('canvas');
  probe.width = probe.height = 8;
  await d.detect(probe);
  return d;
}

/** Распознаватель на чистом JavaScript: медленнее, но работает в любом Safari. */
async function jsDetector(): Promise<Detector> {
  const z = await import('@zxing/library');
  const reader = new z.MultiFormatReader();
  const hints = new Map<number, unknown>([
    [z.DecodeHintType.POSSIBLE_FORMATS, [z.BarcodeFormat.EAN_13, z.BarcodeFormat.EAN_8, z.BarcodeFormat.UPC_A, z.BarcodeFormat.UPC_E]],
    [z.DecodeHintType.TRY_HARDER, true],
  ]);
  reader.setHints(hints);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas unavailable');
  return {
    detect: (v) => {
      // Кадр уменьшаем: штрихкоду хватает ~800 точек по ширине, а распознавание быстрее
      const k = Math.min(1, 800 / (v.videoWidth || 800));
      canvas.width = Math.round(v.videoWidth * k);
      canvas.height = Math.round(v.videoHeight * k);
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const gray = new Uint8ClampedArray(width * height);
      for (let i = 0; i < gray.length; i++) gray[i] = (data[i * 4] ?? 0) * 0.299 + (data[i * 4 + 1] ?? 0) * 0.587 + (data[i * 4 + 2] ?? 0) * 0.114;
      try {
        const r = reader.decodeWithState(new z.BinaryBitmap(new z.HybridBinarizer(new z.RGBLuminanceSource(gray, width, height))));
        return Promise.resolve([{ rawValue: r.getText() }]);
      } catch {
        return Promise.resolve([]);
      } finally {
        reader.reset();
      }
    },
  };
}

const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 160);

/** Первый распознаватель, который заработал; ошибки остальных — для подсказки, если не заработал ни один. */
async function makeDetector(): Promise<Detector> {
  const errors: string[] = [];
  try {
    const n = await nativeDetector();
    if (n) return n;
  } catch (e) {
    errors.push(`встроенный — ${errText(e)}`);
  }
  try {
    return await wasmDetector();
  } catch (e) {
    console.warn('распознаватель WebAssembly не запустился', e);
    errors.push(`wasm — ${errText(e)}`);
  }
  try {
    return await jsDetector();
  } catch (e) {
    errors.push(`js — ${errText(e)}`);
  }
  throw new DetectorError(errors.join('; '));
}

class DetectorError extends Error {}

function cameraError(e: unknown): string {
  if (e instanceof DetectorError) return `Распознаватель штрихкодов не запустился на этом устройстве. Введите цифры ниже. (${e.message})`;
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError') return 'Нет доступа к камере. Разрешите его в настройках браузера или введите цифры штрихкода ниже.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Камера не найдена. Введите цифры штрихкода ниже.';
  return `Камера не запустилась. Введите цифры штрихкода ниже. (${errText(e)})`;
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
        // Распознаватель грузим одновременно с камерой
        const detecting = makeDetector();
        detecting.catch(() => undefined);
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        const el = video.current;
        if (!alive() || !el) return stop();
        // Safari показывает видео без полноэкранного режима, только если оно беззвучное и встроенное
        el.muted = true;
        el.setAttribute('playsinline', '');
        el.srcObject = stream;
        await el.play();
        const detector = await detecting;
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
