import { useSettings } from './stores/settings';

/** 8-битные звуки, синтезированные WebAudio (квадратная/треугольная волна). */
type Sfx = 'complete' | 'click' | 'undo';

type Note = [freq: number, dur: number];

const TUNES: Record<Sfx, { wave: OscillatorType; notes: Note[] }> = {
  complete: { wave: 'square', notes: [[659, 0.06], [988, 0.12]] },
  undo: { wave: 'square', notes: [[392, 0.06], [262, 0.1]] },
  click: { wave: 'square', notes: [[880, 0.03]] },
};

let ctx: AudioContext | null = null;

export function play(name: Sfx, force = false) {
  if (!force && !useSettings.getState().settings.soundEnabled) return;
  try {
    ctx ??= new AudioContext();
    const tune = TUNES[name];
    let t = ctx.currentTime + 0.01;
    const gain = ctx.createGain();
    gain.gain.value = 0.08;
    gain.connect(ctx.destination);
    for (const [freq, dur] of tune.notes) {
      const osc = ctx.createOscillator();
      osc.type = tune.wave;
      osc.frequency.setValueAtTime(freq, t);
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + dur * 0.95);
      t += dur;
    }
  } catch {
    // Аудио недоступно — молча пропускаем
  }
}
