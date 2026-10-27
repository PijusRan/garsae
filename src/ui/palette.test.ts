import { describe, expect, it } from 'vitest';
import { labToHex, mixPalette, type Lab } from './palette';

const hue = ([, a, b]: Lab) => ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
const chroma = ([, a, b]: Lab) => Math.hypot(a, b);

describe('mixPalette', () => {
  it('gives C at a middling tempo the cobalt it started with', () => {
    const top = mixPalette(0, 95, 0).at(-1)!;
    expect(hue(top)).toBeCloseTo(265, 0);
    expect(labToHex(top)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('walks the circle of fifths: a fifth up is a 30 degree step', () => {
    const c = hue(mixPalette(0, 95, 0)[3]);
    const g = hue(mixPalette(7, 95, 0)[3]);
    expect((g - c + 360) % 360).toBeCloseTo(30, 0);
  });

  it('is more vivid at faster tempos', () => {
    expect(chroma(mixPalette(0, 130, 0)[3])).toBeGreaterThan(chroma(mixPalette(0, 60, 0)[3]));
  });

  it('spreads the hue with evolution', () => {
    const still = mixPalette(0, 95, 0);
    const moving = mixPalette(0, 95, 1);
    expect(hue(still[1])).toBeCloseTo(hue(still[4]), 0);
    expect(Math.abs(hue(moving[4]) - hue(moving[1]))).toBeGreaterThan(30);
  });

  it('keeps every key colourful after fitting it into sRGB', () => {
    for (let key = 0; key < 12; key++) {
      const [, , , , bright, top] = mixPalette(key, 60, 1);
      expect(chroma(bright)).toBeGreaterThan(0.05);
      expect(chroma(top)).toBeGreaterThan(0.05);
    }
  });
});
