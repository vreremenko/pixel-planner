/*
 * Голосовая команда без кнопок «Отмена/Готово»: пока человек говорит, щит горит («live»), замолчал —
 * щит меняет цвет и пульсирует («quiet»: нажми, чтобы отправить). Долго молчит после речи — отправляем сами,
 * как это делают голосовые помощники: ничего не записывается без «Применить», так что ошибиться не страшно.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { startRecording, type Recording } from './recorder';

export type VoicePhase = 'off' | 'starting' | 'live' | 'quiet';

/** Громче этого — речь (уровень 0…1 из recorder). */
const LOUD = 0.15;
/** Столько тишины после звука — щит «ждёт» нажатия. */
const QUIET_AFTER_MS = 900;
/** Столько тишины после речи — отправляем сами. */
const AUTO_SEND_MS = 3500;

export function voicePhase(sinceLoudMs: number | null): 'live' | 'quiet' {
  return sinceLoudMs !== null && sinceLoudMs < QUIET_AFTER_MS ? 'live' : 'quiet';
}

export function shouldAutoSend(sinceLoudMs: number | null): boolean {
  return sinceLoudMs !== null && sinceLoudMs >= AUTO_SEND_MS;
}

interface Options {
  /** Запись закончена: WAV в base64, пусто — ничего не записалось. */
  onAudio: (audio: string) => void;
  onError: () => void;
}

export function useVoice({ onAudio, onError }: Options) {
  const [phase, setPhase] = useState<VoicePhase>('off');
  const [level, setLevel] = useState(0);
  /** Хоть раз прозвучала речь — значит, есть что отправлять. */
  const [heard, setHeard] = useState(false);
  const rec = useRef<Recording | null>(null);
  const lastLoud = useRef<number | null>(null);
  const alive = useRef(true);
  const cb = useRef({ onAudio, onError });
  useEffect(() => {
    cb.current = { onAudio, onError };
  });

  const finish = useCallback(() => {
    const r = rec.current;
    rec.current = null;
    setPhase('off');
    setLevel(0);
    if (r) void r.stop().then((a) => cb.current.onAudio(a));
  }, []);

  const cancel = useCallback(() => {
    rec.current?.cancel();
    rec.current = null;
    setPhase('off');
    setLevel(0);
  }, []);

  const start = useCallback(() => {
    if (rec.current) return;
    lastLoud.current = null;
    setHeard(false);
    setPhase('starting');
    startRecording(
      (l) => {
        const now = Date.now();
        if (l > LOUD) {
          lastLoud.current = now;
          setHeard(true);
        }
        const since = lastLoud.current === null ? null : now - lastLoud.current;
        setLevel(l);
        setPhase(voicePhase(since));
        if (shouldAutoSend(since)) finish();
      },
      () => finish(),
    ).then(
      (r) => {
        if (alive.current) {
          rec.current = r;
          setPhase('quiet');
        } else r.cancel();
      },
      () => {
        if (!alive.current) return;
        setPhase('off');
        cb.current.onError();
      },
    );
  }, [finish]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      rec.current?.cancel();
      rec.current = null;
    };
  }, []);

  return { phase, level, heard, start, finish, cancel };
}
