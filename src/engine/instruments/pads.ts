// Pads and melodies. Each instrument has its own generator:
// the chord pad drifts between chords, the bells play sparse notes,
// the arpeggio arpeggiates and the drone holds the root.
import { movementDepth, movementRate, noteDensity } from '../evolution';
import { cleanupAt, envelope, glide, percussive } from '../params';
import { chance, clamp, pick, rand, randInt } from '../random';
import { createChorus, createDrift } from '../synth';
import { chordInPentatonic, midiToFreq, notesInRange, pentatonicNotes, placeInRange } from '../theory';
import type { Core, Instrument, StepInfo } from '../types';
import { voices } from '../models/host';

/** A slow lowpass LFO shared by several instruments for "filter / texture movement". */
function movingFilter(core: Core, base: number, maxDepth: number, baseRate: number, q = 0.5) {
  const { ctx } = core;
  const filter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: base, Q: q });
  const lfo = new OscillatorNode(ctx, { frequency: baseRate });
  const depth = new GainNode(ctx, { gain: 0 });
  lfo.connect(depth).connect(filter.frequency);
  lfo.start();
  const setEvolution = (e: number) => {
    glide(ctx, depth.gain, maxDepth * movementDepth(e), 1.5);
    glide(ctx, lfo.frequency, baseRate * movementRate(e), 1.5);
  };
  return { filter, setEvolution };
}

// ---------------------------------------------------------------- warm chord pad

/** Saw detune (cents) and pan offset for the three unison oscillators in a pad note. */
const PAD_UNISON = [
  { detune: -11, pan: -0.45 },
  { detune: 0, pan: 0 },
  { detune: 12, pan: 0.45 },
];

export function createPad(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const { filter, setEvolution } = movingFilter(core, 4200, 1600, 0.045, 0.5);
  const chorus = createChorus(ctx, { wet: 0.8 });
  const drift = createDrift(ctx, 6);
  filter.connect(chorus.input);
  chorus.output.connect(out);
  let soundingUntil = 0;

  /** Three detuned saws per note, each with its own slow drift, through a filter that opens as the note swells. */
  function voice(midi: number, t: number, hold: number, peak: number, pan: number) {
    const f = midiToFreq(midi);
    const g = new GainNode(ctx, { gain: 0 });
    const lp = new BiquadFilterNode(ctx, { type: 'lowpass', Q: 0.6, frequency: f * 3 });
    lp.frequency.setTargetAtTime(Math.min(f * 14, 11000), t, 0.9);
    lp.frequency.setTargetAtTime(f * 4, t + hold, 1.2);
    lp.connect(g).connect(filter);
    const oscs: OscillatorNode[] = [];
    const nodes: AudioNode[] = [g, lp];
    for (const u of PAD_UNISON) {
      const osc = new OscillatorNode(ctx, { type: 'sawtooth', frequency: f, detune: u.detune + rand(-3, 3) });
      const p = new StereoPannerNode(ctx, { pan: clamp(pan + u.pan, -0.9, 0.9) });
      osc.connect(p).connect(lp);
      drift.connect(osc.detune);
      oscs.push(osc);
      nodes.push(p);
    }
    const end = envelope(g.gain, t, hold, { peak, attack: 1.8, release: 3.2 });
    // Oscillators always start at the same phase. A random start stops every chord attacking identically.
    for (const o of oscs) o.start(t + rand(0, 1 / f));
    cleanupAt(oscs, end, nodes, () => {
      for (const o of oscs) drift.disconnect(o.detune);
    });
  }

  function playChord(s: StepInfo, bars: number) {
    const hold = bars * s.barDur;
    const notes = s.chord.pcs.map((pc) => placeInRange(pc, 53)).sort((x, y) => x - y);
    // Higher Evolution sometimes adds a soft colour tone (the 9th) on top.
    if (chance(0.25 * (noteDensity(s.evolution) - 0.5))) {
      notes.push(placeInRange(s.chord.rootPc + 2, notes[notes.length - 1] + 1));
    }
    notes.forEach((m, i) => {
      const pan = notes.length > 1 ? -0.35 + (0.7 * i) / (notes.length - 1) : 0;
      voice(m, s.time, hold, 0.055, pan);
    });
    // A soft low root anchors the chord.
    voice(placeInRange(s.chord.rootPc, 41), s.time, hold, 0.04, 0);
    soundingUntil = s.time + hold;
  }

  return {
    output: out,
    setEvolution,
    step(s) {
      if (s.stepInBar !== 0) return;
      if (s.chordChanged || s.time >= soundingUntil - 0.01) playChord(s, s.barsLeftInChord);
    },
    deactivate() {
      soundingUntil = 0;
    },
  };
}

// ---------------------------------------------------------------- glass bells / sparse notes

/**
 * Partials of an ideal free bar (glockenspiel, vibraphone): 1, 2.76 and 5.40 times the
 * fundamental, each fading faster than the one below. A twin of the fundamental a few
 * cents sharp beats slowly against it, which is what makes struck metal shimmer.
 */
const BAR_PARTIALS = [
  { ratio: 1, detune: 0, gain: 0.11, decay: 4.6 },
  { ratio: 1, detune: 4, gain: 0.05, decay: 3.6 },
  { ratio: 2.756, detune: 0, gain: 0.04, decay: 1.5 },
  { ratio: 5.404, detune: 0, gain: 0.014, decay: 0.45 },
];

export function createBells(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const tone = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 14000 });
  tone.connect(out);
  const v = voices(core, 'bells', tone);
  let nextAllowed = 0;
  let last = 79;

  function bell(t: number, midi: number, vel: number) {
    if (v.synthOn) synthBell(t, midi, vel);
    v.model?.note(t, midi, 0, vel);
  }

  function synthBell(t: number, midi: number, vel: number) {
    const f = midiToFreq(midi);
    const pan = new StereoPannerNode(ctx, { pan: rand(-0.6, 0.6) });
    const amp = new GainNode(ctx, { gain: vel });
    amp.connect(pan).connect(v.synth);
    const oscs: OscillatorNode[] = [];
    const nodes: AudioNode[] = [amp, pan];
    let end = t;
    for (const p of BAR_PARTIALS) {
      const osc = new OscillatorNode(ctx, { frequency: f * p.ratio, detune: p.detune });
      const g = new GainNode(ctx, { gain: 0 });
      osc.connect(g).connect(amp);
      // Softer strikes lose the upper partials first, like a lighter mallet.
      const level = p.gain * (p.ratio > 2 ? vel : 1);
      end = Math.max(end, percussive(g.gain, t, level, 0.002, p.decay));
      oscs.push(osc);
      nodes.push(g);
    }
    // The mallet: a few milliseconds of noise around the upper partials.
    const strike = new AudioBufferSourceNode(ctx, { buffer: core.noise.hit });
    const strikeBp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: Math.min(f * 4, 9000), Q: 1.5 });
    const strikeGain = new GainNode(ctx, { gain: 0 });
    strike.connect(strikeBp).connect(strikeGain).connect(amp);
    percussive(strikeGain.gain, t, 0.05 * vel, 0.001, 0.025);
    strike.start(t, rand(0, 1.5), 0.05);
    for (const o of oscs) o.start(t);
    cleanupAt(oscs, end, [...nodes, strike, strikeBp, strikeGain]);
  }

  function chooseNote(s: StepInfo): number {
    const pool = pentatonicNotes(s.root, 72, 88);
    if (chance(0.65)) {
      // Step-wise motion from the last note sounds melodic rather than random.
      const idx = pool.indexOf(last);
      const from = idx >= 0 ? idx : Math.floor(pool.length / 2);
      return pool[clamp(from + pick([-2, -1, -1, 1, 1, 2]), 0, pool.length - 1)];
    }
    const chordish = notesInRange(chordInPentatonic(s.root, s.chord), 72, 88);
    return pick(chordish.length ? chordish : pool);
  }

  return {
    output: out,
    step(s) {
      if (s.stepInBar % 2 !== 0 || s.time < nextAllowed) return;
      if (!chance(0.075 * noteDensity(s.evolution))) return;
      last = chooseNote(s);
      bell(s.time, last, rand(0.45, 0.85));
      // Sometimes a short two-note phrase.
      if (chance(0.3)) {
        last = chooseNote(s);
        bell(s.time + s.stepDur * pick([2, 3, 4]), last, rand(0.3, 0.6));
      }
      nextAllowed = s.time + s.stepDur * randInt(6, 14);
    },
  };
}

// ---------------------------------------------------------------- soft arpeggio

/**
 * A felt-mallet marimba: a round fundamental that rings longer on low notes, the bar's
 * tuned overtone two octaves up, a faint tenth partial and a soft wooden knock. Softer
 * notes keep only the fundamental, like a lighter stroke with a yarn mallet.
 */
const MALLET_PARTIALS = [
  { ratio: 1, gain: 1, decay: 1 },
  { ratio: 4, gain: 0.17, decay: 0.2 },
  { ratio: 9.8, gain: 0.05, decay: 0.06 },
];

/** One-bar rhythms (16ths). Calm ones first; livelier settings reach further down the list. */
const ARP_RHYTHMS = [
  'x...x...x.......',
  'x.....x.....x...',
  'x...x...x...x...',
  'x.x.x.......x...',
  'x.x...x.x...x...',
  'x...x.x.x...x.x.',
  'x.x.x.x.x.......',
];

type Contour = 'up' | 'down' | 'arch';

export function createArp(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const { filter, setEvolution } = movingFilter(core, 7000, 1500, 0.06, 0.5);
  // One dark, quiet echo a dotted quarter later: a trail behind the phrase, not more notes.
  const delay = new DelayNode(ctx, { maxDelayTime: 3, delayTime: 0.75 });
  const feedback = new GainNode(ctx, { gain: 0.22 });
  const loopFilter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1500 });
  const wet = new GainNode(ctx, { gain: 0.16 });
  filter.connect(out);
  filter.connect(delay);
  delay.connect(loopFilter).connect(feedback).connect(delay);
  loopFilter.connect(wet).connect(out);
  const v = voices(core, 'arp', filter);

  let phrase: { step: number; midi: number; vel: number }[] = [];
  let last = 64;

  function note(t: number, midi: number, vel: number) {
    if (v.synthOn) synthNote(t, midi, vel);
    v.model?.note(t, midi, 0, vel);
  }

  function synthNote(t: number, midi: number, vel: number) {
    const f = midiToFreq(midi);
    const amp = new GainNode(ctx, { gain: 1 });
    const pan = new StereoPannerNode(ctx, { pan: clamp((midi - 64) / 24, -0.4, 0.4) });
    amp.connect(pan).connect(v.synth);
    // Low bars ring longer than high ones.
    const ring = clamp(1.5 * Math.sqrt(262 / f), 0.7, 2);
    const oscs: OscillatorNode[] = [];
    const nodes: AudioNode[] = [amp, pan];
    let end = t;
    for (const p of MALLET_PARTIALS) {
      const osc = new OscillatorNode(ctx, { frequency: f * p.ratio });
      const g = new GainNode(ctx, { gain: 0 });
      osc.connect(g).connect(amp);
      const level = 0.12 * p.gain * (p.ratio > 1 ? vel * vel : vel);
      end = Math.max(end, percussive(g.gain, t, level, p.ratio > 1 ? 0.002 : 0.006, p.decay * ring));
      oscs.push(osc);
      nodes.push(g);
    }
    const knock = new AudioBufferSourceNode(ctx, { buffer: core.noise.hit });
    const knockLp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 900 });
    const knockGain = new GainNode(ctx, { gain: 0 });
    knock.connect(knockLp).connect(knockGain).connect(amp);
    percussive(knockGain.gain, t, 0.05 * vel, 0.001, 0.015);
    knock.start(t, rand(0, 1.5), 0.04);
    for (const o of oscs) o.start(t);
    cleanupAt(oscs, end, [...nodes, knock, knockLp, knockGain]);
  }

  /** A short broken-chord phrase for one bar: a rhythm, a contour and gentle dynamics. */
  function makePhrase(s: StepInfo) {
    const pool = notesInRange(chordInPentatonic(s.root, s.chord), 55, 74);
    const reach = Math.round(2 + 4 * s.evolution);
    const rhythm = ARP_RHYTHMS[randInt(0, clamp(reach, 0, ARP_RHYTHMS.length - 1))];
    const steps = [...rhythm].map((c, i) => (c === 'x' ? i : -1)).filter((i) => i >= 0);
    const contour = pick<Contour>(['up', 'up', 'down', 'arch']);
    // Start near the last phrase so consecutive phrases connect.
    let idx = pool.findIndex((m) => m >= last);
    if (idx < 0) idx = pool.length - 1;
    if (contour === 'up') idx = clamp(idx - 2, 0, pool.length - 1);
    if (contour === 'down') idx = clamp(idx + 2, 0, pool.length - 1);
    phrase = steps.map((step, i) => {
      const goingUp = contour === 'up' || (contour === 'arch' && i < steps.length / 2);
      if (i > 0) idx = clamp(idx + (goingUp ? 1 : -1) * (chance(0.2) ? 2 : 1), 0, pool.length - 1);
      const vel = i === 0 ? 0.8 : i === steps.length - 1 ? 0.5 : rand(0.55, 0.7);
      return { step, midi: pool[idx], vel };
    });
    last = phrase[phrase.length - 1]?.midi ?? last;
  }

  return {
    output: out,
    setEvolution,
    setTempo(bpm) {
      glide(ctx, delay.delayTime, (60 / bpm) * 1.5, 0.5);
    },
    step(s) {
      if (s.stepInBar === 0) {
        // Whole bars of rest let the phrases breathe; livelier settings rest less.
        if (chance(0.4 - 0.2 * s.evolution)) phrase = [];
        else makePhrase(s);
      }
      const hit = phrase.find((n) => n.step === s.stepInBar);
      if (hit) note(s.time + rand(0, 0.008), hit.midi, hit.vel * rand(0.9, 1));
    },
    deactivate() {
      phrase = [];
    },
  };
}

// ---------------------------------------------------------------- drone

/**
 * The drone's voices, as frequency ratios over the root. Just intonation, so the fifth and
 * octaves lock with the root instead of beating against it. Each upper voice swells and
 * fades on its own slow cycle (14-32 s, about a breath's pace), so the colour shifts while
 * the root underneath never moves.
 */
const DRONE_VOICES: { ratio: number; gain: number; pan: number; breath: number }[] = [
  { ratio: 0.5, gain: 0.07, pan: 0, breath: 0 },
  { ratio: 1, gain: 0.16, pan: 0, breath: 0 },
  { ratio: 1.5, gain: 0.08, pan: -0.3, breath: 0.043 },
  { ratio: 2, gain: 0.07, pan: 0.3, breath: 0.061 },
  { ratio: 3, gain: 0.025, pan: 0.1, breath: 0.031 },
];

/** A soft, flute-like organ tone: mostly fundamental, with a few quiet harmonics for warmth. */
const DRONE_HARMONICS = [0, 1, 0.3, 0.1, 0.04, 0.015];

/**
 * A calm root-and-fifth drone in the tenor register, built to sit still: no detuned saws,
 * no pitch drift, no chorus wobble and nothing in the sub-bass rumble. All of those read as
 * tension. What moves is only the slow breathing of the upper voices.
 */
export function createDrone(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 2200, Q: 0.5 });
  lp.connect(out);
  const wave = ctx.createPeriodicWave(new Float32Array(DRONE_HARMONICS.length), Float32Array.from(DRONE_HARMONICS));
  let voices: { osc: OscillatorNode; ratio: number; depth?: GainNode; breath: number; gain: number }[] = [];
  let sources: AudioScheduledSourceNode[] = [];
  let nodes: AudioNode[] = [];
  let evolution = core.evolution;

  const rootFreq = (root: number) => midiToFreq(placeInRange(root, 45));
  /** How far each upper voice swells, as a fraction of its level. More Evolution, more movement. */
  const breathDepth = (e: number) => 0.2 + 0.3 * movementDepth(e);

  return {
    output: out,
    setEvolution(e) {
      evolution = e;
      for (const v of voices) if (v.depth) glide(ctx, v.depth.gain, v.gain * breathDepth(e), 2);
    },
    activate(t) {
      const f0 = rootFreq(core.root);
      for (const v of DRONE_VOICES) {
        const osc = new OscillatorNode(ctx, { frequency: f0 * v.ratio });
        // The lowest voice is a plain sine: warmth without a rumble.
        if (v.ratio >= 1) osc.setPeriodicWave(wave);
        const g = new GainNode(ctx, { gain: v.gain });
        const p = new StereoPannerNode(ctx, { pan: v.pan });
        osc.connect(g).connect(p).connect(lp);
        osc.start(t);
        sources.push(osc);
        nodes.push(g, p);
        let depth: GainNode | undefined;
        if (v.breath > 0) {
          const lfo = new OscillatorNode(ctx, { frequency: v.breath * rand(0.9, 1.1) });
          depth = new GainNode(ctx, { gain: v.gain * breathDepth(evolution) });
          lfo.connect(depth).connect(g.gain);
          lfo.start(t);
          sources.push(lfo);
          nodes.push(depth);
        }
        voices.push({ osc, ratio: v.ratio, depth, breath: v.breath, gain: v.gain });
      }
    },
    deactivate() {
      for (const s of sources) {
        s.stop();
        s.disconnect();
      }
      for (const n of nodes) n.disconnect();
      voices = [];
      sources = [];
      nodes = [];
    },
    setKey(root) {
      const f0 = rootFreq(root);
      for (const v of voices) glide(ctx, v.osc.frequency, f0 * v.ratio, 1.2);
    },
  };
}
