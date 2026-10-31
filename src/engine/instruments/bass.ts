// Bass generators. All follow the hidden chord engine's roots.
import { noteDensity } from '../evolution';
import { cleanupAt, envelope, percussive } from '../params';
import { chance, clamp, pick, rand } from '../random';
import { saturationCurve } from '../synth';
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
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1600, Q: 0.5 });
  lp.connect(out);
  let last = 43;
  const LO = 36;
  const HI = 55;

  /**
   * Upright-style pluck: a saw and a triangle through a lowpass that closes after the
   * attack, a pitch that settles from a few cents sharp, and a soft finger thump.
   */
  function note(t: number, midi: number, dur: number, vel: number) {
    const f = midiToFreq(midi);
    const g = new GainNode(ctx, { gain: 0 });
    const tone = new BiquadFilterNode(ctx, { type: 'lowpass', Q: 0.9, frequency: 500 + 900 * vel });
    tone.frequency.setTargetAtTime(f * 2.2, t + 0.01, 0.09);
    const a = new OscillatorNode(ctx, { type: 'sawtooth', frequency: f });
    const b = new OscillatorNode(ctx, { type: 'triangle', frequency: f });
    const sawGain = new GainNode(ctx, { gain: 0.45 });
    for (const o of [a, b]) {
      o.detune.setValueAtTime(14, t);
      o.detune.setTargetAtTime(0, t, 0.02);
    }
    a.connect(sawGain).connect(tone);
    b.connect(tone);
    tone.connect(g).connect(lp);
    const end = envelope(g.gain, t, dur, { peak: 0.34 * vel, attack: 0.006, decay: 0.45, sustain: 0.35, release: 0.12 });
    const thump = new AudioBufferSourceNode(ctx, { buffer: core.noise.hit });
    const thumpLp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 380 });
    const thumpGain = new GainNode(ctx, { gain: 0 });
    thump.connect(thumpLp).connect(thumpGain).connect(lp);
    percussive(thumpGain.gain, t, 0.5 * vel, 0.002, 0.035);
    thump.start(t, rand(0, 1.5), 0.06);
    a.start(t);
    b.start(t);
    cleanupAt([a, b], end, [g, tone, sawGain, thump, thumpLp, thumpGain]);
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
    filt.frequency.setValueAtTime(220 + 650 * vel, t);
    filt.frequency.setTargetAtTime(200, t, 0.06);
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
          lp.frequency.setTargetAtTime(Math.min(f * (i === 0 ? 7 : 4.5), 1800), t, 0.008);
          lp.frequency.setTargetAtTime(f * 2.2, t + 0.03, 0.18);
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
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1600, Q: 0.5 });
  lp.connect(out);
  let last = 40;

  function note(t: number, midi: number, dur: number, vel: number) {
    const f = midiToFreq(midi);
    const carrier = new OscillatorNode(ctx, { frequency: f });
    const mod = new OscillatorNode(ctx, { frequency: f });
    const index = new GainNode(ctx, { gain: 0 });
    mod.connect(index).connect(carrier.frequency);
    index.gain.setValueAtTime(f * (1.2 + 1.3 * vel), t);
    index.gain.setTargetAtTime(f * 0.35, t, 0.07);
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
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 700, Q: 0.7 });
  lp.connect(out);
  let riff = pick(ROLLS);

  function note(t: number, midi: number, dur: number, vel: number) {
    const f = midiToFreq(midi);
    const g = new GainNode(ctx, { gain: 0 });
    const a = new OscillatorNode(ctx, { frequency: f });
    const b = new OscillatorNode(ctx, { frequency: f * 2 });
    const c = new OscillatorNode(ctx, { type: 'sawtooth', frequency: f, detune: 4 });
    const bg = new GainNode(ctx, { gain: 0.18 });
    const cg = new GainNode(ctx, { gain: 0.12 });
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
