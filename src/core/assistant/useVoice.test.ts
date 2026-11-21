import { describe, expect, it } from 'vitest';
import { shouldAutoSend, voicePhase } from './useVoice';

describe('щит при записи', () => {
  it('горит, пока звучит голос, и ждёт, когда замолчали', () => {
    expect(voicePhase(null)).toBe('quiet');
    expect(voicePhase(200)).toBe('live');
    expect(voicePhase(1500)).toBe('quiet');
  });
  it('отправляет сам только после речи и долгой тишины', () => {
    expect(shouldAutoSend(null)).toBe(false);
    expect(shouldAutoSend(2000)).toBe(false);
    expect(shouldAutoSend(4000)).toBe(true);
  });
});
