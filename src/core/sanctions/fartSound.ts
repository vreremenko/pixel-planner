/* Синтез «санкционного» звука — отдельно от компонента, чтобы его можно было проверить тестом. */
/**
 * Звук собирается по точкам, как настоящий: череда хлопков «клапана» с неровным шагом (дрожание ±20 %),
 * каждый хлопок — короткий затухающий резонанс 150–260 Гц; высота плавает и к концу падает,
 * а в хвосте хлопки редеют и сбиваются — «пр-р-р… пт… пт». Сверху немного хрипа и мягкое насыщение.
 */
export function fartSamples(rate: number, rnd: () => number = Math.random): Float32Array {
  const dur = 0.65 + rnd() * 0.45;
  const n = Math.ceil(rate * dur);
  const out = new Float32Array(n);
  const f0Start = 85 + rnd() * 40;
  const f0End = 45 + rnd() * 15;
  const tail = 0.72 + rnd() * 0.1; // с этой доли начинается «сбивающийся» хвост
  let t = 0.012;
  let flutter = 1;
  while (t < dur) {
    const k = t / dur;
    // Высота: небольшой подъём в начале, потом спад; поверх — медленное «плавание»
    const f0 = (f0Start + (f0End - f0Start) * k ** 1.3) * (1 + 0.12 * Math.sin(k * 9 + rnd()));
    let period = (1 / f0) * (0.8 + rnd() * 0.4);
    if (k > tail) period *= 1.6 + rnd() * 2.6; // хвост: редкие хлопки
    flutter = flutter * 0.7 + (0.55 + rnd() * 0.45) * 0.3;
    const env = Math.min(1, t / 0.03) * (k > 0.9 ? (1 - k) / 0.1 : 1) * flutter;
    const skip = k > tail && rnd() < 0.25;
    if (!skip) {
      const fr = 150 + rnd() * 110;
      const tau = 0.0025 + rnd() * 0.003;
      const amp = env * (0.7 + rnd() * 0.3);
      const i0 = Math.floor(t * rate);
      const len = Math.min(n - i0, Math.floor(tau * 6 * rate));
      for (let i = 0; i < len; i++) {
        const x = i / rate;
        out[i0 + i] = (out[i0 + i] ?? 0) + amp * Math.exp(-x / tau) * Math.sin(2 * Math.PI * fr * x) + amp * 0.18 * (rnd() * 2 - 1) * Math.exp(-x / (tau * 2));
      }
    }
    t += period;
  }
  // Сглаживание (простой фильтр низких частот ~1 кГц) и мягкое насыщение — «влажный» хрип
  const a = Math.exp((-2 * Math.PI * 1000) / rate);
  let y = 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    y = (1 - a) * (out[i] ?? 0) + a * y;
    const v = Math.tanh(y * 6);
    out[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  if (peak > 0) for (let i = 0; i < n; i++) out[i] = ((out[i] ?? 0) / peak) * 0.9;
  return out;
}
