/*
 * Запись голосовой команды в WAV (16 кГц, моно). Встроенная запись браузера на iPhone даёт формат,
 * который распознавание не принимает, поэтому собираем звук сами: микрофон → отсчёты → WAV.
 * Минута — около 2 МБ.
 */
/* ScriptProcessor устарел, но AudioWorklet требует отдельный файл-модуль и капризен в старых Safari; для записи до минуты его хватает */
/* eslint-disable @typescript-eslint/no-deprecated */

export const MAX_RECORD_SEC = 60;
const RATE = 16_000;
/** Сколько держать микрофон открытым после записи: iPhone (особенно в приложении с экрана «Домой») спрашивает
 * разрешение заново почти при каждом новом включении, поэтому команды подряд идут через тот же поток. */
const KEEP_MIC_MS = 2 * 60_000;

let shared: MediaStream | null = null;
let idle: ReturnType<typeof setTimeout> | undefined;

function closeMic() {
  clearTimeout(idle);
  shared?.getTracks().forEach((t) => {
    t.stop();
  });
  shared = null;
}

async function openMic(): Promise<MediaStream> {
  clearTimeout(idle);
  if (shared?.getAudioTracks().some((t) => t.readyState === 'live')) return shared;
  shared = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  return shared;
}

/** Запись закончена: микрофон гаснет через пару минут — или сразу, если приложение свернули. */
function parkMic() {
  clearTimeout(idle);
  idle = setTimeout(closeMic, KEEP_MIC_MS);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') closeMic();
  });
}

export interface Recording {
  /** Остановить и получить WAV в base64; пусто — ничего не записалось. */
  stop(): Promise<string>;
  /** Бросить запись без отправки. */
  cancel(): void;
}

/** Уровень громкости 0…1 приходит в onLevel ~20 раз в секунду — для «волны». */
export async function startRecording(onLevel: (level: number) => void, onLimit: () => void): Promise<Recording> {
  const stream = await openMic();
  const ctx = new AudioContext();
  await ctx.resume();
  const source = ctx.createMediaStreamSource(stream);
  // ScriptProcessor устарел, но единственный работает во всех Safari без отдельного файла-воркера
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  let samples = 0;
  const limit = ctx.sampleRate * MAX_RECORD_SEC;
  let stopped = false;
  proc.onaudioprocess = (e) => {
    if (stopped) return;
    const input = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
    samples += input.length;
    let peak = 0;
    for (let i = 0; i < input.length; i += 16) peak = Math.max(peak, Math.abs(input[i] ?? 0));
    onLevel(Math.min(1, peak * 2.5));
    if (samples >= limit) onLimit();
  };
  source.connect(proc);
  proc.connect(ctx.destination);

  const release = () => {
    stopped = true;
    proc.disconnect();
    source.disconnect();
    parkMic();
    void ctx.close();
  };
  return {
    stop: () => {
      const rate = ctx.sampleRate;
      release();
      if (samples < rate * 0.3) return Promise.resolve('');
      return Promise.resolve(toBase64(encodeWav(downsample(chunks, samples, rate))));
    },
    cancel: release,
  };
}

/** Склеить куски и пересчитать в 16 кГц (простое усреднение — для речи достаточно). */
function downsample(chunks: readonly Float32Array[], total: number, rate: number): Int16Array {
  const all = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.length;
  }
  const ratio = rate / RATE;
  const out = new Int16Array(Math.floor(total / ratio));
  for (let i = 0; i < out.length; i++) {
    const from = Math.floor(i * ratio);
    const to = Math.min(total, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = from; j < to; j++) sum += all[j] ?? 0;
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, to - from)));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out;
}

function encodeWav(pcm: Int16Array): Uint8Array {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, pcm[i] ?? 0, true);
  return new Uint8Array(buf);
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
