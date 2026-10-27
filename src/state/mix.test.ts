import { describe, expect, it } from 'vitest';
import { TILE_BY_ID } from '../tiles';
import { decodeMix, defaultMix, encodeMix, restoreMixes, surpriseMix, type SavedMix } from './mix';

describe('share links', () => {
  it('round-trips a mix', () => {
    const m = defaultMix();
    m.tiles.bells = { on: false, volume: 0.2 };
    m.evolution = 0.7;
    m.bpm = 104;
    m.key = 4;
    const encoded = encodeMix(m);
    expect(encoded).toContain('pad.65');
    expect(encoded).toContain('-bells.20');
    expect(decodeMix(encoded)).toEqual(m);
  });

  it('leaves BPM and key random when the user did not set them', () => {
    const encoded = encodeMix(defaultMix());
    expect(encoded).not.toMatch(/(^|&)b=/);
    expect(encoded).not.toMatch(/(^|&)k=/);
    const m = decodeMix(encoded)!;
    expect(m.bpm).toBeNull();
    expect(m.key).toBeNull();
  });

  it('ignores junk and clamps values', () => {
    const m = decodeMix('#t=pad.500,nope.20,lofi.x&e=-5&b=999&k=40')!;
    expect(m.tiles.pad).toEqual({ on: true, volume: 1 });
    expect(m.tiles.lofi.volume).toBe(TILE_BY_ID.lofi.defaultVolume);
    expect(m.evolution).toBe(0);
    expect(m.bpm).toBe(130);
    expect(m.key).toBeNull();
    expect(decodeMix('#nothing=here')).toBeNull();
  });
});

describe('surprise me', () => {
  it('stays balanced and calm', () => {
    for (let i = 0; i < 2000; i++) {
      const m = surpriseMix();
      const on = Object.entries(m.tiles).filter(([, s]) => s.on).map(([id]) => id);
      expect(on.length).toBeGreaterThanOrEqual(1);
      expect(on.length).toBeLessThanOrEqual(6);
      expect(on.some((id) => id === 'pad' || id === 'drone')).toBe(true);
      expect(on.filter((id) => TILE_BY_ID[id as keyof typeof TILE_BY_ID].category === 'drums').length).toBeLessThanOrEqual(1);
      expect(on).not.toContain('am');
      expect(on).not.toContain('binaural');
      if (m.tiles.breaks.on) expect(m.tiles.breaks.volume).toBeLessThanOrEqual(0.42);
      expect(m.evolution).toBeLessThanOrEqual(0.5);
      expect(m.bpm).toBeNull();
    }
  });
});

describe('regrouped tiles and undo helpers', () => {
  it('still reads share links that name tiles whose category changed', () => {
    const m = decodeMix('t=brown.35,am.40,crackle.20&e=30');
    expect(m?.tiles.brown.on).toBe(true);
    expect(m?.tiles.am.on).toBe(true);
    expect(m?.tiles.crackle.volume).toBeCloseTo(0.2);
  });

  it('restoreMixes hands back the list it was given', () => {
    const list: SavedMix[] = [{ id: 'a', name: 'A', savedAt: 1, mix: 't=pad.65' }];
    expect(restoreMixes(list)).toEqual(list);
  });
});
