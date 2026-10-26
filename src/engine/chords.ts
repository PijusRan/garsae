// The hidden chord engine: a slow loop of 4 chords, each lasting 2-4 bars.
// Every so often one chord in the loop is swapped for another chord in the scale.
import { chordMaxDistance, chordSwapChance } from './evolution';
import { chance, pick, weightedPick } from './random';
import { CHORD_DEGREES, chordDistance } from './theory';

export interface ChordSlot {
  degree: number;
  bars: number;
}

const TEMPLATES: number[][] = [
  [0, 6, 2, 3],
  [0, 3, 0, 4],
  [0, 2, 6, 3],
  [0, 4, 2, 6],
  [0, 3, 6, 4],
  [0, 1, 2, 3],
  [0, 6, 3, 4],
];

const randomBars = (): number => weightedPick([2, 3, 4], [3, 1, 3]);

export function randomLoop(): ChordSlot[] {
  return pick(TEMPLATES).map((degree) => ({ degree, bars: randomBars() }));
}

export class ChordEngine {
  loop: ChordSlot[];
  index = 0;
  barInChord = 0;
  private started = false;

  constructor(loop: ChordSlot[] = randomLoop()) {
    this.loop = loop;
  }

  get current(): ChordSlot {
    return this.loop[this.index];
  }

  get next(): ChordSlot {
    return this.loop[(this.index + 1) % this.loop.length];
  }

  get barsLeft(): number {
    return this.current.bars - this.barInChord;
  }

  /** Advance by one bar. Returns true when a new chord starts on this bar. */
  advanceBar(evolution: number): boolean {
    if (!this.started) {
      this.started = true;
      return true;
    }
    this.barInChord++;
    if (this.barInChord < this.current.bars) return false;
    this.barInChord = 0;
    this.index++;
    if (this.index >= this.loop.length) {
      this.index = 0;
      if (chance(chordSwapChance(evolution))) this.swapOne(evolution);
    }
    return true;
  }

  /** Swap one chord in the loop for a nearby chord in the scale. */
  swapOne(evolution: number): void {
    const n = this.loop.length;
    // Slot 0 holds the home chord; it moves rarely so the music stays grounded.
    const slot = weightedPick([0, 1, 2, 3].slice(0, n), [0.3, 1, 1, 1].slice(0, n));
    const old = this.loop[slot].degree;
    const prev = this.loop[(slot - 1 + n) % n].degree;
    const nxt = this.loop[(slot + 1) % n].degree;
    const maxD = chordMaxDistance(evolution);
    const candidates = CHORD_DEGREES.filter(
      (d) => d !== old && d !== prev && d !== nxt && chordDistance(old, d) <= maxD,
    );
    let pool = candidates;
    if (pool.length === 0) {
      // Fall back to the closest chords that still avoid repeats.
      const legal = CHORD_DEGREES.filter((d) => d !== old && d !== prev && d !== nxt);
      if (legal.length === 0) return;
      const best = Math.min(...legal.map((d) => chordDistance(old, d)));
      pool = legal.filter((d) => chordDistance(old, d) === best);
    }
    this.loop[slot] = { ...this.loop[slot], degree: pick(pool) };
  }
}
