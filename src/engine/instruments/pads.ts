// Pads and melodies. Each instrument has its own generator:
// the chord pad drifts between chords, the bells play sparse notes,
// the arpeggio arpeggiates and the drone holds the root.
import { movementDepth, movementRate, noteDensity } from '../evolution';
import { cleanupAt, envelope, glide, percussive } from '../params';
import { chance, clamp, pick, rand, randInt } from '../random';
import { chordInPentatonic, midiToFreq, notesInRange, pentatonicNotes, placeInRange } from '../theory';
import type { Core, Instrument, StepInfo } from '../types';

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

export function createPad(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const { filter, setEvolution } = movingFilter(core, 1000, 550, 0.045, 0.6);
  filter.connect(out);
  let soundingUntil = 0;

  function voice(midi: number, t: number, hold: number, peak: number, pan: number) {
    const f = midiToFreq(midi);
    const g = new GainNode(ctx, { gain: 0 });
    const p = new StereoPannerNode(ctx, { pan });
    const a = new OscillatorNode(ctx, { type: 'sawtooth', frequency: f, detune: -7 + rand(-2, 2) });
    const b = new OscillatorNode(ctx, { type: 'triangle', frequency: f, detune: 6 + rand(-2, 2) });
    a.connect(g);
    b.connect(g);
    g.connect(p).connect(filter);
    const end = envelope(g.gain, t, hold, { peak, attack: 1.8, release: 3.2 });
    a.start(t);
    b.start(t);
    cleanupAt([a, b], end, [g, p]);
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

export function createBells(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const tone = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 6500 });
  tone.connect(out);
  let nextAllowed = 0;
  let last = 79;

  function bell(t: number, midi: number, vel: number) {
    const f = midiToFreq(midi);
    const pan = new StereoPannerNode(ctx, { pan: rand(-0.6, 0.6) });
    const amp = new GainNode(ctx, { gain: 0 });
    const carrier = new OscillatorNode(ctx, { frequency: f });
    const mod = new OscillatorNode(ctx, { frequency: f * 3.5 });
    const modGain = new GainNode(ctx, { gain: 0 });
    const shimmer = new OscillatorNode(ctx, { frequency: f * 2.01 });
    const shimmerGain = new GainNode(ctx, { gain: 0 });
    mod.connect(modGain).connect(carrier.frequency);
    carrier.connect(amp);
    shimmer.connect(shimmerGain).connect(amp);
    amp.connect(pan).connect(tone);
    // FM index falls quickly: a bright strike that mellows into a pure tone.
    modGain.gain.setValueAtTime(f * 1.1 * vel, t);
    modGain.gain.exponentialRampToValueAtTime(f * 0.01, t + 1.4);
    percussive(shimmerGain.gain, t, 0.25, 0.003, 1.6);
    const end = percussive(amp.gain, t, 0.16 * vel, 0.004, 4.2);
    for (const o of [carrier, mod, shimmer]) o.start(t);
    cleanupAt([carrier, mod, shimmer], end, [modGain, shimmerGain, amp, pan]);
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

type ArpMode = 'up' | 'down' | 'updown' | 'walk';

export function createArp(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const { filter, setEvolution } = movingFilter(core, 2100, 900, 0.06, 0.7);
  const dry = new GainNode(ctx, { gain: 1 });
  const delay = new DelayNode(ctx, { maxDelayTime: 2, delayTime: 0.5 });
  const feedback = new GainNode(ctx, { gain: 0.38 });
  const loopFilter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 2300 });
  const wet = new GainNode(ctx, { gain: 0.32 });
  filter.connect(dry).connect(out);
  filter.connect(delay);
  delay.connect(loopFilter).connect(feedback).connect(delay);
  loopFilter.connect(wet).connect(out);

  let mode: ArpMode = pick(['up', 'down', 'updown', 'walk']);
  let pos = 0;
  let walkIdx = 2;

  function note(t: number, midi: number, vel: number) {
    const f = midiToFreq(midi);
    const g = new GainNode(ctx, { gain: 0 });
    const a = new OscillatorNode(ctx, { type: 'triangle', frequency: f });
    const b = new OscillatorNode(ctx, { type: 'sine', frequency: f * 2 });
    const bg = new GainNode(ctx, { gain: 0.18 });
    a.connect(g);
    b.connect(bg).connect(g);
    g.connect(filter);
    const end = percussive(g.gain, t, 0.13 * vel, 0.008, 0.75);
    a.start(t);
    b.start(t);
    cleanupAt([a, b], end, [g, bg]);
  }

  function pickFrom(pool: number[]): number {
    const n = pool.length;
    let idx: number;
    switch (mode) {
      case 'up':
        idx = pos % n;
        break;
      case 'down':
        idx = n - 1 - (pos % n);
        break;
      case 'updown': {
        const period = Math.max(1, 2 * n - 2);
        const p = pos % period;
        idx = p < n ? p : period - p;
        break;
      }
      default:
        walkIdx = clamp(walkIdx + pick([-1, 1, 1, -1, 2, -2]), 0, n - 1);
        idx = walkIdx;
    }
    pos++;
    return pool[clamp(idx, 0, n - 1)];
  }

  return {
    output: out,
    setEvolution,
    setTempo(bpm) {
      // Dotted-eighth echo.
      glide(ctx, delay.delayTime, (60 / bpm) * 0.75, 0.5);
    },
    step(s) {
      if (s.stepInBar === 0 && chance(0.12 * s.evolution)) {
        mode = pick(['up', 'down', 'updown', 'walk']);
      }
      if (s.stepInBar % 2 !== 0) return;
      const restChance = 0.62 - 0.36 * noteDensity(s.evolution);
      if (s.stepInBar !== 0 && chance(restChance)) {
        pos++;
        return;
      }
      const pool = notesInRange(chordInPentatonic(s.root, s.chord), 60, 79);
      const vel = s.stepInBar === 0 ? 1 : s.stepInBar % 4 === 0 ? 0.8 : 0.6;
      note(s.time, pickFrom(pool), vel * rand(0.85, 1));
    },
  };
}

// ---------------------------------------------------------------- drone

export function createDrone(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const { filter, setEvolution } = movingFilter(core, 420, 220, 0.03, 0.9);
  filter.connect(out);
  let oscs: { osc: OscillatorNode; interval: number }[] = [];
  let nodes: AudioNode[] = [];

  const baseMidi = (root: number) => placeInRange(root, 36);
  const layout: { interval: number; detune: number; type: OscillatorType; gain: number; pan: number }[] = [
    { interval: 0, detune: -5, type: 'sawtooth', gain: 0.07, pan: -0.3 },
    { interval: 0, detune: 5, type: 'sawtooth', gain: 0.07, pan: 0.3 },
    { interval: 7, detune: 3, type: 'triangle', gain: 0.07, pan: -0.15 },
    { interval: 12, detune: -3, type: 'triangle', gain: 0.06, pan: 0.15 },
    { interval: -12, detune: 0, type: 'sine', gain: 0.1, pan: 0 },
  ];

  return {
    output: out,
    setEvolution,
    activate(t) {
      const base = baseMidi(core.root);
      for (const l of layout) {
        const osc = new OscillatorNode(ctx, { type: l.type, frequency: midiToFreq(base + l.interval), detune: l.detune });
        const g = new GainNode(ctx, { gain: l.gain });
        const p = new StereoPannerNode(ctx, { pan: l.pan });
        osc.connect(g).connect(p).connect(filter);
        osc.start(t);
        oscs.push({ osc, interval: l.interval });
        nodes.push(g, p);
      }
    },
    deactivate() {
      for (const { osc } of oscs) {
        osc.stop();
        osc.disconnect();
      }
      for (const n of nodes) n.disconnect();
      oscs = [];
      nodes = [];
    },
    setKey(root) {
      const base = baseMidi(root);
      for (const { osc, interval } of oscs) glide(ctx, osc.frequency, midiToFreq(base + interval), 1.2);
    },
  };
}
