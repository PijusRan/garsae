// Bass generators. All follow the hidden chord engine's roots.
import { movementDepth, noteDensity } from '../evolution';
import { cleanupAt, envelope, glide, percussive } from '../params';
import { chance, clamp, pick, rand } from '../random';
import { saturationCurve } from '../synth';
import { DORIAN, midiToFreq, placeInRange } from '../theory';
import type { Core, Instrument, StepInfo } from '../types';
import { tileVoice } from '../models/host';

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
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 520 });
  lp.connect(out);
  let soundingUntil = 0;

  function note(t: number, midi: number, hold: number, peak: number) {
    const f = midiToFreq(midi);
    const g = new GainNode(ctx, { gain: 0 });
    const a = new OscillatorNode(ctx, { frequency: f });
    // A quiet second harmonic so small speakers still hear the bass line.
    const b = new OscillatorNode(ctx, { frequency: f * 2 });
    const bg = new GainNode(ctx, { gain: 0.32 });
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

// ---------------------------------------------------------------- walking bass

interface Walked {
  beat: number;
  midi: number;
  vel: number;
  beats: number;
}

/**
 * An upright bass walking, on a plucked-string physical model (models/host.ts). Played as a jazz bassist builds a line:
 * each bar is planned from where it must arrive. Beat 1 lands on the chord (its root on a change, otherwise a chord tone
 * for variety); beats 2 and 3 move towards the next downbeat by chord tones and scale steps; beat 4 approaches it from a
 * half step, a scale step or its fifth above. Calm settings play a two-feel (half notes on 1 and 3); livelier ones walk
 * all four beats, now and then with a ghosted triplet "skip" into the next beat. Notes are long, each plucked afresh.
 */
export function createWalk(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 3200, Q: 0.5 });
  lp.connect(out);
  const bass = tileVoice(core, 'walk', lp);
  const LO = 31;
  const HI = 55;
  let last = 43;
  let fourFeel = false;
  let bar: Walked[] = [];
  /** Where the last bar's line was heading: this bar starts there. */
  let target: number | null = null;

  const scaleOf = (s: StepInfo) => DORIAN.map((i) => (s.root + i) % 12);
  /** Every note in range with one of these pitch classes. */
  const notesOf = (pcs: number[]) => {
    const found: number[] = [];
    for (let m = LO; m <= HI; m++) if (pcs.includes(m % 12)) found.push(m);
    return found;
  };

  /** How beat 4 leads into `target`: a half step either side, the scale step below or above, or its fifth above. */
  function approach(s: StepInfo, target: number, from: number): number {
    const scale = scaleOf(s);
    const options = [target - 1, target + 1, target + 7, ...[-2, -1, 1, 2].map((d) => target + d).filter((m) => scale.includes(m % 12))]
      .filter((m) => m >= LO && m <= HI && m !== target && m !== from);
    // Mostly the near ones, so the line keeps moving by small steps.
    const near = options.filter((m) => Math.abs(m - target) <= 2);
    return near.length && chance(0.8) ? pick(near) : options.length ? pick(options) : target + 1;
  }

  /** A note from `pool` a step or two from `from`, heading for `to`. */
  function towards(from: number, to: number, pool: number[]): number {
    const dir = Math.sign(to - from) || (chance(0.5) ? 1 : -1);
    const ahead = pool.filter((m) => m !== from && Math.sign(m - from) === dir && Math.abs(m - from) <= 5);
    if (!ahead.length) return pool.reduce((best, m) => (m !== from && Math.abs(m - from) < Math.abs(best - from) ? m : best), pool[0]);
    // Short of the target when there is room, and one of the nearest two, so the line steps rather than leaps.
    const short = ahead.filter((m) => Math.abs(m - from) < Math.abs(to - from));
    const options = short.length ? short : ahead;
    options.sort((x, y) => Math.abs(x - from) - Math.abs(y - from));
    return pick(options.slice(0, 2));
  }

  function plan(s: StepInfo): Walked[] {
    const chordTones = notesOf(s.chord.pcs);
    const scaleTones = notesOf(scaleOf(s));
    const changing = s.chordChanged || s.bar % 2 === 0;
    const own = changing ? nearest(s.chord.rootPc, last, LO, HI) : nearest(pick(s.chord.pcs.slice(1, 3)), last, LO, HI);
    // Land where the last bar was heading, as long as it is still in the chord.
    const first = target !== null && s.chord.pcs.includes(target % 12) ? target : own;
    const into = s.barsLeftInChord === 1;
    // Where the next bar starts: the next chord's root, or another tone of this chord.
    const next = into ? nearest(s.nextChord.rootPc, first, LO, HI) : nearest(pick(s.chord.pcs), first + pick([-5, -3, 3, 5]), LO, HI);
    target = next;
    const downbeat = s.chordChanged ? 0.95 : 0.85;
    if (!fourFeel) {
      // Two-feel: the root, then the fifth, or a tone that leads to the next chord.
      const third = into ? approach(s, next, first) : nearest(s.chord.pcs[2], first + 7, LO, HI);
      return [
        { beat: 0, midi: first, vel: downbeat, beats: 1.9 },
        { beat: 2, midi: third, vel: 0.75, beats: 1.9 },
      ];
    }
    const four = approach(s, next, first);
    // Beats 2 and 3 never take the approach note itself, so beat 4 always moves.
    const two = towards(first, four, scaleTones.filter((m) => m !== four));
    const three = towards(two, four, chordTones.filter((m) => m !== four && m !== two));
    return [
      { beat: 0, midi: first, vel: downbeat, beats: 0.92 },
      { beat: 1, midi: two, vel: 0.72, beats: 0.92 },
      { beat: 2, midi: three, vel: 0.8, beats: 0.92 },
      { beat: 3, midi: four, vel: 0.74, beats: 0.92 },
    ];
  }

  return {
    output: out,
    step(s) {
      if (s.stepInBar % 4 !== 0) return;
      const beat = s.stepInBar / 4;
      const beatDur = s.stepDur * 4;
      if (beat === 0) {
        // The feel holds for a whole chord.
        if (s.chordChanged || bar.length === 0) fourFeel = chance(clamp((s.evolution - 0.2) / 0.45, 0, 1));
        bar = plan(s);
      }
      const n = bar.find((x) => x.beat === beat);
      if (!n) return;
      last = n.midi;
      bass.note(s.time, n.midi, n.beats * beatDur, n.vel * rand(0.92, 1.05));
      // A skip: a ghosted repeat on the last triplet of beats 2 and 4, rarer when calm.
      if (fourFeel && (beat === 1 || beat === 3) && chance(0.1 * noteDensity(s.evolution))) {
        bass.note(s.time + (beatDur * 2) / 3, n.midi, beatDur / 4, 0.35);
      }
    },
    deactivate() {
      bar = [];
      target = null;
    },
  };
}

// ---------------------------------------------------------------- pulse bass

export function createPulse(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  // Gentle saturation rounds the filtered saws into a warmer, analog-sounding growl.
  const drive = new WaveShaperNode(ctx, { curve: saturationCurve(1.8), oversample: '2x' });
  const driveIn = new GainNode(ctx, { gain: 1.6 });
  const driveOut = new GainNode(ctx, { gain: 0.6 });
  driveIn.connect(drive).connect(driveOut).connect(out);

  function note(t: number, midi: number, dur: number, vel: number) {
    const f = midiToFreq(midi);
    const osc = new OscillatorNode(ctx, { type: 'sawtooth', frequency: f, detune: -5 });
    const osc2 = new OscillatorNode(ctx, { type: 'sawtooth', frequency: f, detune: 6 });
    const sub = new OscillatorNode(ctx, { frequency: f });
    const filt = new BiquadFilterNode(ctx, { type: 'lowpass', Q: 2 });
    const g = new GainNode(ctx, { gain: 0 });
    osc.connect(filt);
    osc2.connect(filt);
    sub.connect(g);
    filt.connect(g).connect(driveIn);
    filt.frequency.setValueAtTime(380 + 1400 * vel, t);
    filt.frequency.setTargetAtTime(420, t, 0.08);
    const end = envelope(g.gain, t, dur, { peak: 0.2 * vel, attack: 0.006, decay: 0.2, sustain: 0.4, release: 0.07 });
    osc.start(t);
    osc2.start(t);
    sub.start(t);
    cleanupAt([osc, osc2, sub], end, [filt, g]);
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

// ---------------------------------------------------------------- glide bass

/**
 * A monophonic synth bass that slides between notes, like a Moog line played legato.
 * One set of oscillators runs while the tile is on; each bar's line is scheduled at its
 * downbeat as pitch glides and filter swells, so legato notes never retrigger.
 */
export function createGlide(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  // Two cascaded lowpasses: a steeper, rounder 24 dB slope with a touch of resonance.
  const lp1 = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 300, Q: 0.7 });
  const lp2 = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 300, Q: 2.2 });
  const amp = new GainNode(ctx, { gain: 0 });
  const drive = new WaveShaperNode(ctx, { curve: saturationCurve(1.5), oversample: '2x' });
  lp1.connect(lp2).connect(amp).connect(drive).connect(out);
  let oscs: OscillatorNode[] = [];
  let mix: AudioNode[] = [];
  let last = 40;

  function line(s: StepInfo): { step: number; midi: number; len: number }[] {
    const root = nearest(s.chord.rootPc, last, 33, 47);
    const fifth = nearest(s.chord.pcs[2], root + 7, 33, 50);
    const octave = root + 12 <= 52 ? root + 12 : root - 12;
    const busy = noteDensity(s.evolution);
    const shapes = [
      [{ step: 0, midi: root, len: 10 }, { step: 10, midi: fifth, len: 6 }],
      [{ step: 0, midi: root, len: 6 }, { step: 6, midi: octave, len: 4 }, { step: 10, midi: root, len: 6 }],
      [{ step: 0, midi: root, len: 16 }],
      [{ step: 0, midi: root, len: 7 }, { step: 8, midi: fifth, len: 4 }, { step: 12, midi: octave, len: 4 }],
    ];
    // Calm settings favour long held notes; livelier ones the moving shapes.
    const shape = chance(0.45 - 0.25 * (busy - 0.6)) ? shapes[2] : pick(shapes);
    // Into a new chord, slide up or down to it from a step away on the last 16th.
    if (s.barsLeftInChord === 1 && shape[shape.length - 1].len > 2 && chance(0.5)) {
      const tail = shape[shape.length - 1];
      const target = nearest(s.nextChord.rootPc, tail.midi, 33, 47);
      tail.len -= 2;
      shape.push({ step: 14, midi: target + (target > tail.midi ? -2 : 2), len: 2 });
    }
    return shape;
  }

  return {
    output: out,
    activate(t) {
      const types: { type: OscillatorType; detune: number; gain: number }[] = [
        { type: 'sawtooth', detune: -4, gain: 0.5 },
        { type: 'sawtooth', detune: 5, gain: 0.5 },
        { type: 'triangle', detune: 0, gain: 0.7 },
      ];
      const f = midiToFreq(last);
      for (const o of types) {
        const osc = new OscillatorNode(ctx, { type: o.type, frequency: f, detune: o.detune });
        const g = new GainNode(ctx, { gain: o.gain });
        osc.connect(g).connect(lp1);
        osc.start(t);
        oscs.push(osc);
        mix.push(g);
      }
    },
    deactivate() {
      for (const o of oscs) {
        o.stop();
        o.disconnect();
      }
      for (const n of mix) n.disconnect();
      oscs = [];
      mix = [];
    },
    step(s) {
      if (s.stepInBar !== 0 || oscs.length === 0) return;
      const notes = line(s);
      notes.forEach((n, i) => {
        const t = s.time + n.step * s.stepDur;
        const f = midiToFreq(n.midi);
        // The first note of a bar re-articulates; later ones slide in legato.
        const slide = i === 0 ? 0.012 : 0.045;
        for (const o of oscs) o.frequency.setTargetAtTime(f, t, slide);
        for (const lp of [lp1, lp2]) {
          lp.frequency.setTargetAtTime(Math.min(f * (i === 0 ? 12 : 8), 3200), t, 0.008);
          lp.frequency.setTargetAtTime(f * 4, t + 0.03, 0.2);
        }
        if (i === 0) {
          amp.gain.setTargetAtTime(0.05, t - 0.012, 0.004);
          amp.gain.setTargetAtTime(0.26, t, 0.006);
        }
        last = n.midi;
      });
      // A short breath before the next bar's downbeat keeps the line phrased.
      const end = s.time + 16 * s.stepDur;
      amp.gain.setTargetAtTime(0.12, end - s.stepDur * 0.6, 0.03);
    },
  };
}

// ---------------------------------------------------------------- FM bass

/**
 * The DX7-style electric bass: a sine carrier with a 1:1 modulator whose index falls fast
 * after the attack, so each note starts with a rubbery bite and settles into a round tone.
 * It plays a relaxed two-feel: long notes on 1 and 3, sometimes a fifth or octave on the
 * "and" of 2 or 4, and a step into the next chord's root.
 */
export function createFmBass(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 3600, Q: 0.5 });
  lp.connect(out);
  let last = 40;

  function note(t: number, midi: number, dur: number, vel: number) {
    const f = midiToFreq(midi);
    const carrier = new OscillatorNode(ctx, { frequency: f });
    const mod = new OscillatorNode(ctx, { frequency: f });
    const index = new GainNode(ctx, { gain: 0 });
    mod.connect(index).connect(carrier.frequency);
    index.gain.setValueAtTime(f * (1.2 + 1.3 * vel), t);
    index.gain.setTargetAtTime(f * 0.6, t, 0.09);
    const g = new GainNode(ctx, { gain: 0 });
    carrier.connect(g).connect(lp);
    const end = envelope(g.gain, t, dur, { peak: 0.32 * vel, attack: 0.004, decay: 0.5, sustain: 0.45, release: 0.09 });
    carrier.start(t);
    mod.start(t);
    cleanupAt([carrier, mod], end, [index, g]);
  }

  return {
    output: out,
    step(s) {
      if (s.stepInBar % 2 !== 0) return;
      const root = nearest(s.chord.rootPc, last, 33, 47);
      const busy = noteDensity(s.evolution);
      if (s.stepInBar === 0 || s.stepInBar === 8) {
        // Beat 3 sometimes rests or answers with the fifth, so the line breathes.
        if (s.stepInBar === 8 && chance(0.25)) return;
        const midi = s.stepInBar === 8 && chance(0.3) ? nearest(s.chord.pcs[2], root + 7, 33, 50) : root;
        note(s.time, midi, s.stepDur * (s.stepInBar === 0 ? 5 : 4.5), s.stepInBar === 0 ? 1 : 0.8);
        last = midi;
        return;
      }
      if ((s.stepInBar === 6 || s.stepInBar === 14) && chance(0.25 * busy)) {
        // Into a new chord, step towards its root; otherwise a short octave or fifth.
        let midi: number;
        if (s.stepInBar === 14 && s.barsLeftInChord === 1) {
          const target = nearest(s.nextChord.rootPc, last, 33, 47);
          midi = target + (target > last ? -2 : 2);
        } else {
          midi = chance(0.5) ? Math.min(root + 12, 52) : nearest(s.chord.pcs[2], root + 7, 33, 50);
        }
        note(s.time, midi, s.stepDur * 1.5, rand(0.6, 0.75));
        last = midi;
      }
    },
  };
}

// ---------------------------------------------------------------- rolling bass

/** One-bar syncopated rhythms: step and scale degree (0 root, 1 octave, 2 fifth). */
const ROLLS: { step: number; deg: 0 | 1 | 2; len: number }[][] = [
  [{ step: 0, deg: 0, len: 3 }, { step: 3, deg: 0, len: 2 }, { step: 6, deg: 1, len: 2 }, { step: 10, deg: 2, len: 2 }, { step: 12, deg: 0, len: 2 }],
  [{ step: 0, deg: 0, len: 4 }, { step: 6, deg: 2, len: 2 }, { step: 8, deg: 0, len: 3 }, { step: 11, deg: 1, len: 2 }],
  [{ step: 0, deg: 0, len: 2 }, { step: 3, deg: 2, len: 2 }, { step: 8, deg: 0, len: 2 }, { step: 10, deg: 0, len: 1 }, { step: 13, deg: 1, len: 2 }],
  [{ step: 0, deg: 0, len: 5 }, { step: 7, deg: 0, len: 2 }, { step: 10, deg: 2, len: 4 }],
];

/**
 * A round, syncopated bass (dub and downtempo): a sine with its octave and a hint of saw,
 * short notes with a soft attack. The riff stays the same across a chord, moving to the
 * new root on changes; Evolution swaps the riff now and then.
 */
export function createRolling(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1500, Q: 0.7 });
  lp.connect(out);
  let riff = pick(ROLLS);

  function note(t: number, midi: number, dur: number, vel: number) {
    const f = midiToFreq(midi);
    const g = new GainNode(ctx, { gain: 0 });
    const a = new OscillatorNode(ctx, { frequency: f });
    const b = new OscillatorNode(ctx, { frequency: f * 2 });
    const c = new OscillatorNode(ctx, { type: 'sawtooth', frequency: f, detune: 4 });
    const bg = new GainNode(ctx, { gain: 0.18 });
    const cg = new GainNode(ctx, { gain: 0.22 });
    a.connect(g);
    b.connect(bg).connect(g);
    c.connect(cg).connect(g);
    g.connect(lp);
    const end = envelope(g.gain, t, dur, { peak: 0.33 * vel, attack: 0.008, decay: 0.25, sustain: 0.7, release: 0.06 });
    for (const o of [a, b, c]) o.start(t);
    cleanupAt([a, b, c], end, [g, bg, cg]);
  }

  return {
    output: out,
    step(s) {
      if (s.stepInBar === 0 && s.chordChanged && chance(0.15 + 0.5 * s.evolution)) riff = pick(ROLLS);
      const hit = riff.find((n) => n.step === s.stepInBar);
      if (!hit) return;
      // Calm settings sometimes leave out the busier offbeat notes.
      if (hit.step % 4 !== 0 && chance(0.3 - 0.2 * noteDensity(s.evolution))) return;
      const root = placeInRange(s.chord.rootPc, 33);
      const midi = hit.deg === 0 ? root : hit.deg === 1 ? root + 12 : nearest(s.chord.pcs[2], root + 7, 33, 52);
      note(s.time, midi, hit.len * s.stepDur * 0.85, hit.step === 0 ? 1 : rand(0.7, 0.9));
    },
  };
}

// ---------------------------------------------------------------- reese bass

/**
 * Two saws a few cents apart, so they beat and slowly turn inside the sound, over a clean sine that carries the actual
 * low end. The saws are cut below 110 Hz, so the beating never makes the bass itself swell and vanish.
 */
export function createReese(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const amp = new GainNode(ctx, { gain: 0 });
  amp.connect(out);
  const hp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 110, Q: 0.6 });
  const lp1 = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1200, Q: 0.7 });
  const lp2 = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1200, Q: 1.1 });
  const drive = new WaveShaperNode(ctx, { curve: saturationCurve(1.7), oversample: '2x' });
  const driveOut = new GainNode(ctx, { gain: 0.34 });
  hp.connect(lp1).connect(lp2).connect(drive).connect(driveOut).connect(amp);
  const lfo = new OscillatorNode(ctx, { frequency: 0.11 });
  const sweep = new GainNode(ctx, { gain: 0 });
  lfo.connect(sweep);
  sweep.connect(lp1.detune);
  sweep.connect(lp2.detune);
  lfo.start();
  let oscs: OscillatorNode[] = [];
  let sub: OscillatorNode | null = null;
  let subGain: GainNode | null = null;
  let last = 40;

  return {
    output: out,
    activate(t) {
      const f = midiToFreq(last);
      oscs = [-11, 11].map((detune) => {
        const o = new OscillatorNode(ctx, { type: 'sawtooth', frequency: f, detune });
        o.connect(hp);
        o.start(t);
        return o;
      });
      sub = new OscillatorNode(ctx, { frequency: f });
      subGain = new GainNode(ctx, { gain: 0.32 });
      sub.connect(subGain).connect(amp);
      sub.start(t);
    },
    deactivate() {
      for (const o of [...oscs, ...(sub ? [sub] : [])]) {
        o.stop();
        o.disconnect();
      }
      subGain?.disconnect();
      oscs = [];
      sub = null;
      subGain = null;
    },
    setEvolution(e) {
      glide(ctx, sweep.gain, 200 + 700 * movementDepth(e), 1.5);
    },
    step(s) {
      if (!sub || s.stepInBar % 4 !== 0) return;
      const beat = s.stepInBar / 4;
      if (beat === 0) {
        last = nearest(s.chord.rootPc, last, 31, 43);
        const f = midiToFreq(last);
        for (const o of [...oscs, sub]) o.frequency.setTargetAtTime(f, s.time, 0.03);
        // Each bar speaks: the level falls away and swells back.
        amp.gain.setTargetAtTime(0.25, s.time - 0.03, 0.012);
        amp.gain.setTargetAtTime(1, s.time, 0.05);
      } else if (beat === 2 && chance(0.25 * noteDensity(s.evolution))) {
        const up = nearest(s.chord.pcs[2], last + 7, 31, 50);
        for (const o of [...oscs, sub]) o.frequency.setTargetAtTime(midiToFreq(up), s.time, 0.06);
      }
    },
  };
}

// ---------------------------------------------------------------- fretless bass

/**
 * A fretless electric played near the neck: a soft triangle and sine that slide up into each note, and a resonance
 * that sweeps down through the note for the vowel-like "mwah" nothing with frets can do. Long notes get a slow vibrato.
 */
export function createFretless(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 4200, Q: 0.5 });
  lp.connect(out);
  const vibrato = new OscillatorNode(ctx, { frequency: 4.6 });
  vibrato.start();
  let last = 43;
  const LO = 33;
  const HI = 55;

  function note(t: number, midi: number, dur: number, vel: number) {
    const f = midiToFreq(midi);
    const tri = new OscillatorNode(ctx, { type: 'triangle', frequency: f });
    const saw = new OscillatorNode(ctx, { type: 'sawtooth', frequency: f });
    const sine = new OscillatorNode(ctx, { frequency: f });
    const sawGain = new GainNode(ctx, { gain: 0.16 });
    const mwah = new BiquadFilterNode(ctx, { type: 'peaking', Q: 2.2, gain: 8, frequency: f * 6 });
    mwah.frequency.setTargetAtTime(f * 2.2, t + 0.02, 0.16);
    const g = new GainNode(ctx, { gain: 0 });
    const vibDepth = new GainNode(ctx, { gain: 0 });
    vibrato.connect(vibDepth);
    vibDepth.gain.setValueAtTime(0, t + 0.3);
    vibDepth.gain.linearRampToValueAtTime(dur > 0.6 ? 9 : 0, t + 0.8);
    const oscs = [tri, saw, sine];
    for (const o of oscs) {
      // The finger arrives a little flat and slides up to pitch.
      o.detune.setValueAtTime(-38, t);
      o.detune.setTargetAtTime(0, t + 0.01, 0.035);
      vibDepth.connect(o.detune);
    }
    saw.connect(sawGain).connect(mwah);
    tri.connect(mwah);
    sine.connect(g);
    mwah.connect(g).connect(lp);
    const end = envelope(g.gain, t, dur, { peak: 0.26 * vel, attack: 0.012, decay: 0.7, sustain: 0.55, release: 0.14 });
    for (const o of oscs) o.start(t);
    cleanupAt(oscs, end, [sawGain, mwah, g, vibDepth], () => {
      vibrato.disconnect(vibDepth);
    });
  }

  return {
    output: out,
    step(s) {
      const busy = noteDensity(s.evolution);
      if (s.stepInBar === 0) {
        last = nearest(s.chord.rootPc, last, LO, HI);
        note(s.time, last, s.stepDur * pick([5, 6, 8]), 1);
      } else if (s.stepInBar === 6 && chance(0.4 * busy)) {
        const options = s.chord.pcs.map((pc) => nearest(pc, last, LO, HI)).filter((m) => m !== last);
        last = pick(options.length ? options : [last]);
        note(s.time, last, s.stepDur * 4, rand(0.7, 0.85));
      } else if (s.stepInBar === 10 && chance(0.35 * busy)) {
        const options = s.chord.pcs.map((pc) => nearest(pc, last, LO, HI)).filter((m) => m !== last);
        last = pick(options.length ? options : [last]);
        note(s.time, last, s.stepDur * 3, rand(0.65, 0.8));
      } else if (s.stepInBar === 14 && s.barsLeftInChord === 1) {
        // A slide towards the next chord.
        const target = nearest(s.nextChord.rootPc, last, LO, HI);
        last = target + (target > last ? -2 : 2);
        note(s.time, last, s.stepDur * 1.8, 0.7);
      }
    },
  };
}

// ---------------------------------------------------------------- 808 bass

/** Where the booms fall in a bar. Sparse on purpose: the long tail is the point. */
const BOOMS = [[0, 10], [0, 7, 10], [0, 8], [0, 6, 14], [0]];

/**
 * The long sine of a TR-808 kick played as a bass: a quick drop in pitch for the punch, then a slow decay, gently
 * driven so its overtones carry the note on small speakers. One at a time, each new note cutting off the last.
 */
export function create808(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const drive = new WaveShaperNode(ctx, { curve: saturationCurve(2.4), oversample: '2x' });
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 2600, Q: 0.5 });
  drive.connect(lp).connect(out);
  let shape = BOOMS[0];
  let current: GainNode | null = null;

  function boom(t: number, midi: number, len: number, vel: number) {
    const f = midiToFreq(midi);
    current?.gain.setTargetAtTime(0, t - 0.006, 0.004);
    const osc = new OscillatorNode(ctx, { frequency: f * 2.1 });
    osc.frequency.setValueAtTime(f * 2.1, t);
    osc.frequency.exponentialRampToValueAtTime(f, t + 0.045);
    const g = new GainNode(ctx, { gain: 0 });
    osc.connect(g).connect(drive);
    const end = percussive(g.gain, t, 0.72 * vel, 0.003, len);
    osc.start(t);
    cleanupAt([osc], end, [g]);
    current = g;
  }

  return {
    output: out,
    step(s) {
      if (s.stepInBar === 0 && s.bar % 2 === 0 && chance(0.2 + 0.5 * s.evolution)) shape = pick(BOOMS);
      if (!shape.includes(s.stepInBar)) return;
      const idx = shape.indexOf(s.stepInBar);
      const next = shape[idx + 1] ?? 16;
      const root = placeInRange(s.chord.rootPc, 31);
      const midi = idx > 0 && chance(0.2) ? nearest(s.chord.pcs[2], root + 7, 31, 45) : root;
      // Rings until nearly the next note, up to a couple of beats.
      note808(s, midi, next, idx);
    },
    deactivate() {
      current = null;
    },
  };

  function note808(s: StepInfo, midi: number, next: number, idx: number) {
    const gap = (next - s.stepInBar) * s.stepDur;
    boom(s.time, midi, clamp(gap * 1.3, 0.35, 1.8), idx === 0 ? 1 : 0.8);
  }
}

// ---------------------------------------------------------------- muted bass

/** One-bar riffs for a palm-muted electric: step and scale degree (0 root, 1 octave, 2 fifth, 3 seventh). */
const MUTED_RIFFS: { step: number; deg: 0 | 1 | 2 | 3 }[][] = [
  [{ step: 0, deg: 0 }, { step: 3, deg: 0 }, { step: 6, deg: 2 }, { step: 8, deg: 0 }, { step: 14, deg: 3 }],
  [{ step: 0, deg: 0 }, { step: 6, deg: 0 }, { step: 8, deg: 2 }, { step: 11, deg: 0 }],
  [{ step: 0, deg: 0 }, { step: 4, deg: 2 }, { step: 7, deg: 1 }, { step: 10, deg: 0 }, { step: 12, deg: 3 }],
  [{ step: 0, deg: 0 }, { step: 2, deg: 0 }, { step: 8, deg: 2 }, { step: 10, deg: 2 }],
];

/**
 * A short-scale bass with old flatwounds and foam under the strings, as on 1960s soul records: all thump and no
 * ring. A triangle and a little saw through a dark filter, a finger thud, and the warm squash of tape.
 */
export function createMuted(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1100, Q: 0.6 });
  const sat = new WaveShaperNode(ctx, { curve: saturationCurve(1.9), oversample: '2x' });
  const level = new GainNode(ctx, { gain: 0.75 });
  lp.connect(sat).connect(level).connect(out);
  let riff = pick(MUTED_RIFFS);

  function note(t: number, midi: number, vel: number, len: number) {
    const f = midiToFreq(midi);
    const tri = new OscillatorNode(ctx, { type: 'triangle', frequency: f });
    const saw = new OscillatorNode(ctx, { type: 'sawtooth', frequency: f });
    const sawGain = new GainNode(ctx, { gain: 0.25 });
    const g = new GainNode(ctx, { gain: 0 });
    tri.connect(g);
    saw.connect(sawGain).connect(g);
    g.connect(lp);
    const end = envelope(g.gain, t, len, { peak: 0.52 * vel, attack: 0.004, decay: 0.22, sustain: 0.3, release: 0.05 });
    const thud = new AudioBufferSourceNode(ctx, { buffer: core.noise.hit });
    const thudLp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 420 });
    const thudGain = new GainNode(ctx, { gain: 0 });
    thud.connect(thudLp).connect(thudGain).connect(lp);
    percussive(thudGain.gain, t, 0.5 * vel, 0.002, 0.03);
    thud.start(t, rand(0, 1.5), 0.05);
    tri.start(t);
    saw.start(t);
    cleanupAt([tri, saw], end, [sawGain, g, thud, thudLp, thudGain]);
  }

  return {
    output: out,
    step(s) {
      if (s.stepInBar === 0 && s.chordChanged && chance(0.15 + 0.5 * s.evolution)) riff = pick(MUTED_RIFFS);
      const hit = riff.find((n) => n.step === s.stepInBar);
      if (!hit) return;
      if (hit.step !== 0 && chance(0.25 - 0.15 * noteDensity(s.evolution))) return;
      const root = placeInRange(s.chord.rootPc, 33);
      const midi =
        hit.deg === 0
          ? root
          : hit.deg === 1
            ? root + 12
            : hit.deg === 2
              ? nearest(s.chord.pcs[2], root + 7, 33, 52)
              : nearest(s.chord.pcs[s.chord.pcs.length - 1], root + 10, 33, 52);
      note(s.time, midi, hit.step % 4 === 0 ? 1 : rand(0.72, 0.88), s.stepDur * 1.3);
    },
  };
}
