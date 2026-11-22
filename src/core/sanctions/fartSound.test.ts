import { describe, expect, it } from 'vitest';
import { fartSamples } from './fartSound';

describe('звук санкций', () => {
  it('длиной 0,65–1,1 с, без тишины-заглушки и без перегруза', () => {
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const rate = 44_100;
    const s = fartSamples(rate, rnd);
    expect(s.length / rate).toBeGreaterThan(0.65);
    expect(s.length / rate).toBeLessThan(1.11);
    const peak = s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(peak).toBeCloseTo(0.9, 2);
    expect(s.every((v) => Number.isFinite(v))).toBe(true);
    // Энергия в основном в низах: соседние точки похожи (нет писка)
    let diff = 0;
    for (let i = 1; i < s.length; i++) diff += Math.abs((s[i] ?? 0) - (s[i - 1] ?? 0));
    expect(diff / s.length).toBeLessThan(0.05);
  });
});
