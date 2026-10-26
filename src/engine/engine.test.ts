import { describe, expect, it } from 'vitest';
import { ChordEngine } from './chords';
import { drift, makeTracks, mutateOnce, freshSlices, mutateSlices, sliceSource, parsePattern } from './drums/patterns';
import {
  CHORD_DEGREES,
  DORIAN,
  chordDistance,
  chordInPentatonic,
  chordInfo,
  chordTones,
  pentatonicPcs,
} from './theory';
import { chordSwapChance, drumMutationChance } from './evolution';

describe('theory', () => {
  it('builds diatonic Dorian chords', () => {
    expect(chordTones(0)).toEqual([0, 3, 7, 10]); // i m7
    expect(chordTones(3)).toEqual([5, 9, 12, 19]); // IV add9
    expect(chordInfo(2, 0).name).toBe('Dm7');
    expect(chordInfo(9, 6).name).toBe('Gmaj7');
  });

  it('keeps every chord tone inside the Dorian scale', () => {
    for (const d of CHORD_DEGREES) {
      for (const t of chordTones(d)) expect(DORIAN).toContain(t % 12);
    }
  });

  it('snaps chord tones onto the minor pentatonic for melodic parts', () => {
    for (let root = 0; root < 12; root++) {
      const pent = pentatonicPcs(root);
      for (const d of CHORD_DEGREES) {
        for (const pc of chordInPentatonic(root, chordInfo(root, d))) expect(pent).toContain(pc);
      }
    }
  });

  it('measures chord distance by shared tones', () => {
    expect(chordDistance(0, 0)).toBe(0);
    expect(chordDistance(0, 2)).toBe(1); // i and bIII share three tones
    expect(chordDistance(0, 1)).toBeGreaterThanOrEqual(3);
  });
});

describe('chord engine', () => {
  it('starts a chord on the first bar and moves through the loop', () => {
    const ce = new ChordEngine([
      { degree: 0, bars: 2 },
      { degree: 6, bars: 2 },
      { degree: 2, bars: 4 },
      { degree: 3, bars: 2 },
    ]);
    const changes: number[] = [];
    for (let bar = 0; bar < 10; bar++) if (ce.advanceBar(0)) changes.push(bar);
    expect(changes).toEqual([0, 2, 4, 8]);
    expect(ce.current.degree).toBe(3);
  });

  it('never swaps at Evolution 0 and keeps chords legal when swapping', () => {
    expect(chordSwapChance(0)).toBe(0);
    const still = new ChordEngine();
    const before = still.loop.map((s) => s.degree).join();
    for (let i = 0; i < 400; i++) still.advanceBar(0);
    expect(still.loop.map((s) => s.degree).join()).toBe(before);

    const moving = new ChordEngine();
    for (let i = 0; i < 2000; i++) {
      moving.advanceBar(1);
      for (let j = 0; j < 4; j++) {
        expect(CHORD_DEGREES).toContain(moving.loop[j].degree as (typeof CHORD_DEGREES)[number]);
        expect(moving.loop[j].degree).not.toBe(moving.loop[(j + 1) % 4].degree);
      }
    }
  });

  it('limits how far a swapped chord moves at low Evolution', () => {
    for (let i = 0; i < 300; i++) {
      const ce = new ChordEngine();
      const before = ce.loop.map((s) => s.degree);
      ce.swapOne(0.05);
      const after = ce.loop.map((s) => s.degree);
      const idx = after.findIndex((d, k) => d !== before[k]);
      if (idx >= 0) expect(chordDistance(before[idx], after[idx])).toBeLessThanOrEqual(2);
    }
  });
});

describe('drum mutation', () => {
  it('parses patterns', () => {
    expect(parsePattern('X.x.o.g.')).toEqual([1, 0, 0.8, 0, 0.5, 0, 0.26, 0]);
  });

  it('never touches core hits', () => {
    const tracks = makeTracks([
      { voice: 'kick', pattern: 'X.....x...x.....', core: true },
      { voice: 'snare', pattern: '....X.......X...', core: true },
      { voice: 'hat', pattern: 'x.o.x.o.x.o.x.oo' },
    ]);
    const kick = [...tracks[0].cur];
    const snare = [...tracks[1].cur];
    for (let i = 0; i < 5000; i++) mutateOnce(tracks);
    expect(tracks[0].cur).toEqual(kick);
    expect(tracks[1].cur).toEqual(snare);
    // Drift is pulled back so soft tracks never wander into chaos.
    expect(drift(tracks)).toBeLessThan(16);
  });

  it('only mutates drums when Evolution is above 0', () => {
    expect(drumMutationChance(0)).toBe(0);
    expect(drumMutationChance(1)).toBe(1);
  });

  it('rearranges breakbeat slices within bounds', () => {
    const s = freshSlices(8);
    for (let pos = 0; pos < 32; pos++) expect(sliceSource(s, pos)).toBe(pos);
    for (let i = 0; i < 2000; i++) {
      mutateSlices(s);
      for (let pos = 0; pos < 32; pos++) {
        const src = sliceSource(s, pos);
        expect(src).toBeGreaterThanOrEqual(0);
        expect(src).toBeLessThan(32);
      }
    }
  });
});
