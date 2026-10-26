import type { Master } from './master';
import type { NoiseBank } from './noise';
import type { ChordInfo } from './theory';

/** Everything a generator needs to know about one 16th-note step. */
export interface StepInfo {
  /** Global 16th-note counter. */
  step: number;
  /** 0-15 within the bar. */
  stepInBar: number;
  bar: number;
  /** AudioContext time at which this step starts. */
  time: number;
  stepDur: number;
  barDur: number;
  bpm: number;
  /** Key root, pitch class 0-11. */
  root: number;
  /** Evolution slider, 0-1. */
  evolution: number;
  chord: ChordInfo;
  nextChord: ChordInfo;
  /** True on the first step of a bar where a new chord starts. */
  chordChanged: boolean;
  /** Bars left in the current chord, including this one. */
  barsLeftInChord: number;
}

/**
 * One tile's sound generator. Each instrument defines its own generator.
 * The engine wraps it in a Tile that owns the volume fade.
 */
export interface Instrument {
  /** Audio output; the Tile connects it to its own gain bus. Effect tiles have none. */
  readonly output?: AudioNode;
  /** Called when the tile turns on (continuous sources start here). */
  activate?(time: number): void;
  /** Called once the fade-out has finished (continuous sources stop here). */
  deactivate?(): void;
  /** Called for each 16th-note step while the tile is audible. */
  step?(s: StepInfo): void;
  setEvolution?(e: number): void;
  setKey?(root: number): void;
  setTempo?(bpm: number): void;
  /** Effect tiles (AM, wobble) turn their level into a master parameter instead of a gain. */
  setLevel?(level: number): void;
}

export interface Core {
  ctx: BaseAudioContext;
  noise: NoiseBank;
  master: Master;
  /** Live musical state, for instruments that need it outside step(). */
  root: number;
  bpm: number;
  evolution: number;
}

export type InstrumentFactory = (core: Core) => Instrument;
