// Bass generators. All follow the hidden chord engine's roots.
import { noteDensity } from '../evolution';
import { cleanupAt, envelope } from '../params';
import { chance, clamp, pick, rand } from '../random';
import { DORIAN, midiToFreq, placeInRange } from '../theory';
import type { Core, Instrument, StepInfo } from '../types';

/** The MIDI note with pitch class `pc` closest to `ref`, kept inside [lo, hi]. */
function nearest(pc: number, ref: number, lo: number, hi: number): number {
  let best = placeInRange(pc, lo);
  for (let m = best; m <= hi; m += 12) if (Math.abs(m - ref) < Math.abs(best - ref)) best = m;
  return clamp(best, lo, hi);
}

// ---------------------------------------------------------------- sub bass

export function createSub(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 260 });
  lp.connect(out);
  let soundingUntil = 0;

  function note(t: number, midi: number, hold: number, peak: number) {
    const f = midiToFreq(midi);
    const g = new GainNode(ctx, { gain: 0 });
    const a = new OscillatorNode(ctx, { frequency: f });
    // A quiet second harmonic so small speakers still hear the bass line.
    const b = new OscillatorNode(ctx, { frequency: f * 2 });
    const bg = new GainNode(ctx, { gain: 0.22 });
    a.connect(g);
    b.connect(bg).connect(g);
    g.connect(lp);
    const end = envelope(g.gain, t, hold, { peak, attack: 0.12, release: 0.6 });
    a.start(t);
    b.start(t);
    cleanupAt([a, b], end, [g, bg]);
  }

  return {
    output: out,
    step(s) {
      if (s.stepInBar !== 0) return;
      if (!s.chordChanged && s.time < soundingUntil - 0.01) return;
      const midi = placeInRange(s.chord.rootPc, 33);
      const hold = s.barsLeftInChord * s.barDur - 0.05;
      note(s.time, midi, hold, 0.42);
      soundingUntil = s.time + hold;
      // Livelier settings add a soft fifth on the last beat before the chord changes.
      if (s.barsLeftInChord >= 1 && chance(0.35 * (noteDensity(s.evolution) - 0.6))) {
        const pickup = s.time + (s.barsLeftInChord * 16 - 4) * s.stepDur;
        note(pickup, midi + 7, s.stepDur * 3, 0.22);
      }
    },
    deactivate() {
      soundingUntil = 0;
    },
  };
}

// ---------------------------------------------------------------- warm walking bass

export function createWalk(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 820, Q: 0.9 });
  lp.connect(out);
  let last = 43;
  const LO = 36;
  const HI = 55;

  function note(t: number, midi: number, dur: number, vel: number) {
    const f = midiToFreq(midi);
    const g = new GainNode(ctx, { gain: 0 });
    const a = new OscillatorNode(ctx, { type: 'triangle', frequency: f });
    const b = new OscillatorNode(ctx, { frequency: f });
    a.connect(g);
    b.connect(g);
    g.connect(lp);
    const end = envelope(g.gain, t, dur, { peak: 0.3 * vel, attack: 0.012, decay: 0.3, sustain: 0.5, release: 0.14 });
    a.start(t);
    b.start(t);
    cleanupAt([a, b], end, [g]);
  }

  function choose(s: StepInfo, beat: number): number {
    if (beat === 0) return nearest(s.chord.rootPc, last, LO, HI);
    if (s.barsLeftInChord === 1 && beat === 3) {
      // Approach the next chord's root from one scale step above or below.
      const target = nearest(s.nextChord.rootPc, last, LO + 2, HI - 2);
      const scale = DORIAN.map((i) => (s.root + i) % 12);
      const above = [1, 2].map((d) => target + d).find((m) => scale.includes(m % 12)) ?? target + 2;
      const below = [1, 2].map((d) => target - d).find((m) => scale.includes(m % 12)) ?? target - 2;
      return Math.abs(above - last) < Math.abs(below - last) ? above : below;
    }
    // Chord tones on strong beats, scale tones as passing notes.
    const pcs = beat === 2 || chance(0.6) ? s.chord.pcs : DORIAN.map((i) => (s.root + i) % 12);
    const options = pcs.map((pc) => nearest(pc, last, LO, HI)).filter((m) => m !== last && Math.abs(m - last) <= 7);
    return options.length ? pick(options) : nearest(s.chord.rootPc, last, LO, HI);
  }

  return {
    output: out,
    step(s) {
      if (s.stepInBar % 4 !== 0) return;
      const beat = s.stepInBar / 4;
      const restChance = 0.28 - 0.18 * noteDensity(s.evolution);
      if (beat !== 0 && !(s.barsLeftInChord === 1 && beat === 3) && chance(restChance)) return;
      last = choose(s, beat);
      note(s.time, last, s.stepDur * 3.3, beat === 0 ? 1 : rand(0.7, 0.9));
    },
  };
}

// ---------------------------------------------------------------- pulse bass

export function createPulse(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });

  function note(t: number, midi: number, dur: number, vel: number) {
    const f = midiToFreq(midi);
    const osc = new OscillatorNode(ctx, { type: 'sawtooth', frequency: f });
    const sub = new OscillatorNode(ctx, { frequency: f });
    const filt = new BiquadFilterNode(ctx, { type: 'lowpass', Q: 2 });
    const g = new GainNode(ctx, { gain: 0 });
    osc.connect(filt);
    sub.connect(g);
    filt.connect(g).connect(out);
    filt.frequency.setValueAtTime(220 + 650 * vel, t);
    filt.frequency.setTargetAtTime(200, t, 0.06);
    const end = envelope(g.gain, t, dur, { peak: 0.22 * vel, attack: 0.006, decay: 0.2, sustain: 0.4, release: 0.07 });
    osc.start(t);
    sub.start(t);
    cleanupAt([osc, sub], end, [filt, g]);
  }

  return {
    output: out,
    step(s) {
      if (s.stepInBar % 2 !== 0) return;
      const onBeat = s.stepInBar % 4 === 0;
      if (!onBeat && chance(0.3 - 0.2 * noteDensity(s.evolution))) return;
      let midi = placeInRange(s.chord.rootPc, 36);
      if (!onBeat && chance(0.12 * s.evolution)) midi += 12;
      note(s.time, midi, s.stepDur * 1.2, onBeat ? 1 : 0.7);
    },
  };
}
