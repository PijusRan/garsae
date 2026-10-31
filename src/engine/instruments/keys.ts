// Keys, voices and solo instruments in the pads category, each with its own generator:
// electric piano, choir, felt piano, string ensemble, vibraphone and tape flute.
import { movementDepth, noteDensity } from '../evolution';
import { cleanupAt, envelope, glide, percussive } from '../params';
import { chance, clamp, pick, rand, randInt } from '../random';
import { startLoop } from '../noise';
import { createChorus, createDrift, saturationCurve } from '../synth';
import { chordInPentatonic, midiToFreq, notesInRange, pentatonicNotes, placeInRange } from '../theory';
import type { Core, Instrument, StepInfo } from '../types';

/** The chord's tones as a close voicing from `lo` upwards, with an optional 9th on top. */
function voicing(s: StepInfo, lo: number, ninth: boolean): number[] {
  const notes = s.chord.pcs.map((pc) => placeInRange(pc, lo)).sort((a, b) => a - b);
  if (ninth) notes.push(placeInRange(s.chord.rootPc + 2, notes[notes.length - 1] + 1));
  return notes;
}

// ---------------------------------------------------------------- electric piano

/**
 * A tine electric piano in the DX7 style (algorithm 5): a soft FM pair for the body and a
 * second pair with a 14:1 modulator for the bell-like tine, which fades within a second.
 * Harder notes bring out more tine. A slow stereo tremolo gives it the suitcase sway.
 */
export function createEPiano(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const warmth = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 9000, Q: 0.4 });
  const pan = new StereoPannerNode(ctx, { pan: 0 });
  const trem = new OscillatorNode(ctx, { frequency: 2.6 });
  const tremDepth = new GainNode(ctx, { gain: 0.28 });
  trem.connect(tremDepth).connect(pan.pan);
  trem.start();
  const chorus = createChorus(ctx, { wet: 0.4, rate: 0.6 });
  warmth.connect(pan).connect(chorus.input);
  chorus.output.connect(out);
  let nextHit = 0;

  function note(t: number, midi: number, hold: number, vel: number) {
    const f = midiToFreq(midi);
    const amp = new GainNode(ctx, { gain: 0 });
    amp.connect(warmth);
    const body = new OscillatorNode(ctx, { frequency: f });
    const bodyMod = new OscillatorNode(ctx, { frequency: f });
    const bodyIndex = new GainNode(ctx, { gain: 0 });
    bodyMod.connect(bodyIndex).connect(body.frequency);
    bodyIndex.gain.setValueAtTime(f * (0.5 + 0.7 * vel), t);
    bodyIndex.gain.setTargetAtTime(f * 0.38, t, 0.6);
    const tine = new OscillatorNode(ctx, { frequency: f });
    const tineMod = new OscillatorNode(ctx, { frequency: f * 14 });
    const tineIndex = new GainNode(ctx, { gain: 0 });
    const tineGain = new GainNode(ctx, { gain: 0 });
    tineMod.connect(tineIndex).connect(tine.frequency);
    tineIndex.gain.setValueAtTime(f * 1.4 * vel, t);
    tineIndex.gain.setTargetAtTime(0, t, 0.08);
    tineGain.gain.setValueAtTime(0.6 * vel * vel, t);
    tineGain.gain.setTargetAtTime(0, t, 0.32);
    body.connect(amp);
    tine.connect(tineGain).connect(amp);
    // A struck note: it decays while held, then damps quickly on release.
    const end = envelope(amp.gain, t, hold, { peak: 0.1 * vel, attack: 0.003, decay: 2.6, sustain: 0.25, release: 0.35 });
    const oscs = [body, bodyMod, tine, tineMod];
    for (const o of oscs) o.start(t);
    cleanupAt(oscs, end, [amp, bodyIndex, tineIndex, tineGain]);
  }

  /** A rolled voicing: the notes land a few milliseconds apart, low to high. */
  function chord(s: StepInfo, at: number, hold: number, vel: number) {
    const notes = voicing(s, 55, chance(0.3 + 0.2 * s.evolution));
    // Sometimes drop the root: rootless voicings sound softer under a bass.
    if (notes.length > 3 && chance(0.4)) notes.shift();
    notes.forEach((m, i) => note(at + i * rand(0.008, 0.02), m, hold, vel * rand(0.85, 1)));
  }

  return {
    output: out,
    step(s) {
      if (s.time < nextHit) return;
      const beat = s.stepInBar / 4;
      const onBar = s.stepInBar === 0;
      // Beat 1 of a new chord always plays. Elsewhere sparse comping on beats and their "and"s.
      if (onBar && s.chordChanged) {
        chord(s, s.time, s.stepDur * 6, 0.85);
        nextHit = s.time + s.stepDur * 4;
        return;
      }
      if (s.stepInBar % 2 !== 0) return;
      const p = (Number.isInteger(beat) ? 0.12 : 0.08) * noteDensity(s.evolution);
      if (!chance(onBar ? 0.5 : p)) return;
      chord(s, s.time, s.stepDur * pick([2, 3, 4, 6]), rand(0.5, 0.75));
      nextHit = s.time + s.stepDur * pick([4, 6, 8]);
    },
    deactivate() {
      nextHit = 0;
    },
  };
}

// ---------------------------------------------------------------- choir

/** Formants (Hz) and relative gains for soft vowels. Choirs sing these, not bright "ee"s. */
const VOWELS = {
  oo: [
    { f: 350, g: 1 },
    { f: 640, g: 0.35 },
    { f: 2700, g: 0.14 },
  ],
  oh: [
    { f: 450, g: 1 },
    { f: 800, g: 0.5 },
    { f: 2830, g: 0.18 },
  ],
  ah: [
    { f: 750, g: 1 },
    { f: 1150, g: 0.6 },
    { f: 2900, g: 0.22 },
  ],
} as const;
type Vowel = keyof typeof VOWELS;

/**
 * Wordless voices: each note is two detuned saws with a delayed vibrato and a breath of
 * noise, and the whole choir sings through one bank of vowel formants that drifts slowly
 * between "oo", "oh" and "ah". Evolution makes the vowel change more often.
 */
export function createChoir(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const chorus = createChorus(ctx, { wet: 0.7, rate: 0.35, depth: 0.0022 });
  chorus.output.connect(out);
  const voices = new GainNode(ctx, { gain: 1 });
  const formants = VOWELS.oo.map((v) => {
    const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: v.f, Q: 7 });
    const g = new GainNode(ctx, { gain: v.g });
    voices.connect(bp).connect(g).connect(chorus.input);
    return { bp, g };
  });
  const drift = createDrift(ctx, 5, 0.09);
  const vibrato = new OscillatorNode(ctx, { frequency: 5.1 });
  vibrato.start();
  let vowel: Vowel = 'oo';
  let soundingUntil = 0;

  function setVowel(v: Vowel, timeConstant: number) {
    vowel = v;
    VOWELS[v].forEach((p, i) => {
      glide(ctx, formants[i].bp.frequency, p.f, timeConstant);
      glide(ctx, formants[i].g.gain, p.g, timeConstant);
    });
  }

  function voice(midi: number, t: number, hold: number, peak: number, pan: number) {
    const f = midiToFreq(midi);
    const g = new GainNode(ctx, { gain: 0 });
    const p = new StereoPannerNode(ctx, { pan });
    g.connect(p).connect(voices);
    // Vibrato fades in after the attack, like a held sung note.
    const vibDepth = new GainNode(ctx, { gain: 0 });
    vibrato.connect(vibDepth);
    vibDepth.gain.setValueAtTime(0, t);
    vibDepth.gain.linearRampToValueAtTime(14, t + 1.6);
    const oscs = [-7, 8].map((d) => {
      const o = new OscillatorNode(ctx, { type: 'sawtooth', frequency: f, detune: d + rand(-3, 3) });
      o.connect(g);
      vibDepth.connect(o.detune);
      drift.connect(o.detune);
      return o;
    });
    const breath = new AudioBufferSourceNode(ctx, { buffer: core.noise.get('pink'), loop: true });
    const breathGain = new GainNode(ctx, { gain: 0.25 });
    breath.connect(breathGain).connect(g);
    const end = envelope(g.gain, t, hold, { peak, attack: 2.2, release: 3.5 });
    for (const o of oscs) o.start(t + rand(0, 1 / f));
    startLoop(breath, t);
    cleanupAt([...oscs, breath], end, [g, p, vibDepth, breathGain], () => {
      vibrato.disconnect(vibDepth);
      for (const o of oscs) drift.disconnect(o.detune);
    });
  }

  function playChord(s: StepInfo, bars: number) {
    const hold = bars * s.barDur;
    // Upper voices in the alto/soprano range, and a tenor on the root.
    const notes = voicing(s, 60, false).slice(0, 3);
    notes.forEach((m, i) => voice(m, s.time, hold, 0.05, -0.4 + 0.4 * i));
    voice(placeInRange(s.chord.rootPc, 48), s.time, hold, 0.045, 0.2);
    soundingUntil = s.time + hold;
  }

  return {
    output: out,
    setEvolution(e) {
      // Keep the current vowel but let livelier settings open the formants a little.
      for (const f of formants) glide(ctx, f.bp.Q, 7 - 2 * movementDepth(e), 1.5);
    },
    step(s) {
      if (s.stepInBar !== 0) return;
      if (s.chordChanged && chance(0.25 + 0.5 * s.evolution)) {
        setVowel(pick((Object.keys(VOWELS) as Vowel[]).filter((v) => v !== vowel)), s.barDur * 0.6);
      }
      if (s.chordChanged || s.time >= soundingUntil - 0.01) playChord(s, s.barsLeftInChord);
    },
    deactivate() {
      soundingUntil = 0;
    },
  };
}

// ---------------------------------------------------------------- felt piano

/** String stiffness: overtones run sharp, f(n) = n·f·√(1 + B·n²). It is what makes additive tones sound like a piano. */
const PIANO_B = 0.00032;

/**
 * An upright with felt between the hammers and the strings, as modern classical records use it. Each note sums
 * stiff-string partials, the low ones doubled a cent or two apart for the beating of a real unison. Every partial
 * falls fast and then slowly, the higher ones sooner. Harder notes reach more partials; a soft thud of felt starts each.
 * Sparse phrases over a low root on each chord, with plenty of air.
 */
export function createFeltPiano(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const felt = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 7500, Q: 0.35 });
  const body = new BiquadFilterNode(ctx, { type: 'peaking', frequency: 190, Q: 0.9, gain: 2.5 });
  felt.connect(body).connect(out);
  let nextNote = 0;
  let last = 67;

  function note(t: number, midi: number, hold: number, vel: number) {
    const f = midiToFreq(midi);
    const pan = new StereoPannerNode(ctx, { pan: clamp((midi - 62) / 32, -0.45, 0.45) });
    const amp = new GainNode(ctx, { gain: 0.15 });
    amp.connect(pan).connect(felt);
    // Low strings ring far longer than high ones.
    const ring = clamp(7 * Math.sqrt(220 / f), 2.5, 9);
    const count = clamp(Math.floor(9000 / f), 4, 14);
    const oscs: OscillatorNode[] = [];
    const nodes: AudioNode[] = [amp, pan];
    for (let n = 1; n <= count; n++) {
      const level = vel * Math.exp(-(n - 1) * (0.62 - 0.24 * vel));
      const decay = ring / (1 + 0.6 * (n - 1));
      const g = new GainNode(ctx, { gain: 0 });
      g.connect(amp);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(level, t + 0.012 - 0.006 * vel);
      // A prompt fall, then the long aftersound.
      g.gain.setTargetAtTime(level * 0.42, t + 0.012, decay * 0.07);
      g.gain.setTargetAtTime(0, t + 0.012 + decay * 0.22, decay * 0.3);
      nodes.push(g);
      for (const cents of n <= 3 ? [-0.7, 0.8] : [0]) {
        const osc = new OscillatorNode(ctx, { frequency: n * f * Math.sqrt(1 + PIANO_B * n * n), detune: cents });
        const share = new GainNode(ctx, { gain: n <= 3 ? 0.6 : 1 });
        osc.connect(share).connect(g);
        oscs.push(osc);
        nodes.push(share);
      }
    }
    // The damper comes down when the note is let go.
    amp.gain.setValueAtTime(0.15, t + hold);
    amp.gain.setTargetAtTime(0, t + hold, 0.14);
    const end = t + hold + 0.9;
    const thud = new AudioBufferSourceNode(ctx, { buffer: core.noise.hit });
    const thudLp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1800 });
    const thudGain = new GainNode(ctx, { gain: 0 });
    thud.connect(thudLp).connect(thudGain).connect(amp);
    percussive(thudGain.gain, t, 0.45 * vel, 0.002, 0.03);
    thud.start(t, rand(0, 1.5), 0.06);
    for (const o of oscs) o.start(t);
    cleanupAt(oscs, end, [...nodes, thud, thudLp, thudGain]);
  }

  function melody(s: StepInfo): number {
    const pool = pentatonicNotes(s.root, 60, 79);
    if (chance(0.7)) {
      const idx = pool.indexOf(last);
      const from = idx >= 0 ? idx : Math.floor(pool.length / 2);
      return pool[clamp(from + pick([-2, -1, -1, 1, 1, 2]), 0, pool.length - 1)];
    }
    const chordish = notesInRange(chordInPentatonic(s.root, s.chord), 60, 79);
    return pick(chordish.length ? chordish : pool);
  }

  return {
    output: out,
    step(s) {
      if (s.stepInBar === 0 && s.chordChanged) {
        const hold = Math.min(s.barsLeftInChord * s.barDur, 5);
        note(s.time, placeInRange(s.chord.rootPc, 40), hold, 0.55);
        // A soft spread of the chord above it, the notes landing a breath apart.
        const notes = voicing(s, 55, false);
        if (chance(0.55)) notes.forEach((m, i) => note(s.time + 0.05 + i * rand(0.03, 0.07), m, hold, rand(0.3, 0.42)));
        nextNote = s.time + s.stepDur * pick([4, 6, 8]);
        return;
      }
      if (s.stepInBar % 2 !== 0 || s.time < nextNote) return;
      if (!chance(0.14 * noteDensity(s.evolution))) return;
      last = melody(s);
      note(s.time + rand(0, 0.012), last, s.stepDur * pick([6, 8, 12]), rand(0.38, 0.68));
      nextNote = s.time + s.stepDur * pick([2, 3, 4, 6, 8]);
    },
    deactivate() {
      nextNote = 0;
    },
  };
}

// ---------------------------------------------------------------- string ensemble

/**
 * A 1970s string machine: three slightly detuned saws per note, which is how the first ones got their width, through
 * a slow chorus and a faster one in series. A cut below the cello range keeps it out of the bass's way, and two broad
 * lifts stand in for the body and sheen of real strings.
 */
export function createStrings(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const hp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 150, Q: 0.6 });
  const body = new BiquadFilterNode(ctx, { type: 'peaking', frequency: 430, Q: 0.8, gain: 2.5 });
  const sheen = new BiquadFilterNode(ctx, { type: 'peaking', frequency: 3000, Q: 0.7, gain: 2 });
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 9000, Q: 0.5 });
  const fast = createChorus(ctx, { delay: 0.006, depth: 0.0006, rate: 5.3, wet: 0.5 });
  const slow = createChorus(ctx, { delay: 0.012, depth: 0.0028, rate: 0.63, wet: 0.8 });
  hp.connect(body).connect(sheen).connect(lp).connect(fast.input);
  fast.output.connect(slow.input);
  slow.output.connect(out);
  const drift = createDrift(ctx, 4, 0.08);
  let soundingUntil = 0;

  function voice(midi: number, t: number, hold: number, peak: number) {
    const f = midiToFreq(midi);
    const g = new GainNode(ctx, { gain: 0 });
    g.connect(hp);
    const oscs = [-7, 0.5, 8].map((d) => {
      const o = new OscillatorNode(ctx, { type: 'sawtooth', frequency: f, detune: d + rand(-1.5, 1.5) });
      o.connect(g);
      drift.connect(o.detune);
      return o;
    });
    const end = envelope(g.gain, t, hold, { peak, attack: 1.3, release: 2.8 });
    for (const o of oscs) o.start(t + rand(0, 1 / f));
    cleanupAt(oscs, end, [g], () => {
      for (const o of oscs) drift.disconnect(o.detune);
    });
  }

  function playChord(s: StepInfo, bars: number) {
    const hold = bars * s.barDur;
    const notes = voicing(s, 55, false);
    // Doubling the root up high opens the voicing like a section playing in octaves.
    notes.push(placeInRange(s.chord.rootPc, 72));
    for (const m of notes) voice(m, s.time, hold, 0.035);
    soundingUntil = s.time + hold;
  }

  return {
    output: out,
    step(s) {
      if (s.stepInBar !== 0) return;
      if (s.chordChanged || s.time >= soundingUntil - 0.01) playChord(s, s.barsLeftInChord);
    },
    deactivate() {
      soundingUntil = 0;
    },
  };
}

// ---------------------------------------------------------------- vibraphone

/** A vibraphone bar is tuned so its overtones fall at 4 and 10 times the fundamental. The fundamental rings on. */
const VIBE_PARTIALS = [
  { ratio: 1, detune: 0, gain: 1, decay: 1 },
  { ratio: 1, detune: 2.5, gain: 0.35, decay: 0.8 },
  { ratio: 4, detune: 0, gain: 0.3, decay: 0.2 },
  { ratio: 10, detune: 0, gain: 0.09, decay: 0.07 },
];

/**
 * Soft mallets on metal bars with the motor running: the discs above the resonators open and close at about 4 Hz,
 * so every note shimmers in level, and a little across the stereo field. Quiet two- and three-note comping.
 */
export function createVibes(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const tone = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 11000, Q: 0.4 });
  const motor = new GainNode(ctx, { gain: 0.8 });
  const sweep = new StereoPannerNode(ctx, { pan: 0 });
  const rotor = new OscillatorNode(ctx, { frequency: 4.1 });
  const depth = new GainNode(ctx, { gain: 0.2 });
  const panDepth = new GainNode(ctx, { gain: 0.16 });
  rotor.connect(depth).connect(motor.gain);
  rotor.connect(panDepth).connect(sweep.pan);
  rotor.start();
  tone.connect(motor).connect(sweep).connect(out);
  let nextHit = 0;

  function note(t: number, midi: number, vel: number) {
    const f = midiToFreq(midi);
    const amp = new GainNode(ctx, { gain: 0.16 * vel });
    const pan = new StereoPannerNode(ctx, { pan: clamp((midi - 67) / 28, -0.4, 0.4) });
    amp.connect(pan).connect(tone);
    const ring = clamp(4.6 * Math.sqrt(262 / f), 2, 5.5);
    const oscs: OscillatorNode[] = [];
    const nodes: AudioNode[] = [amp, pan];
    let end = t;
    for (const p of VIBE_PARTIALS) {
      const osc = new OscillatorNode(ctx, { frequency: f * p.ratio, detune: p.detune });
      const g = new GainNode(ctx, { gain: 0 });
      osc.connect(g).connect(amp);
      // Lighter strokes barely wake the upper partials.
      const level = p.gain * (p.ratio > 1 ? vel * vel : 1);
      end = Math.max(end, percussive(g.gain, t, level, 0.003, p.decay * ring));
      oscs.push(osc);
      nodes.push(g);
    }
    const mallet = new AudioBufferSourceNode(ctx, { buffer: core.noise.hit });
    const malletBp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: Math.min(f * 3, 6000), Q: 1 });
    const malletGain = new GainNode(ctx, { gain: 0 });
    mallet.connect(malletBp).connect(malletGain).connect(amp);
    percussive(malletGain.gain, t, 0.5 * vel, 0.001, 0.02);
    mallet.start(t, rand(0, 1.5), 0.04);
    for (const o of oscs) o.start(t);
    cleanupAt(oscs, end, [...nodes, mallet, malletBp, malletGain]);
  }

  function comp(s: StepInfo, at: number, vel: number) {
    const notes = voicing(s, 57, chance(0.35)).slice(-3);
    notes.forEach((m, i) => note(at + i * rand(0.006, 0.016), m, vel * rand(0.85, 1)));
  }

  return {
    output: out,
    setEvolution(e) {
      glide(ctx, depth.gain, 0.14 + 0.12 * e, 1);
    },
    step(s) {
      if (s.time < nextHit) return;
      if (s.stepInBar === 0 && s.chordChanged) {
        comp(s, s.time, 0.8);
        nextHit = s.time + s.stepDur * 6;
        return;
      }
      if (s.stepInBar % 2 !== 0 || !chance(0.09 * noteDensity(s.evolution))) return;
      comp(s, s.time, rand(0.5, 0.72));
      nextHit = s.time + s.stepDur * pick([6, 8, 10]);
    },
    deactivate() {
      nextHit = 0;
    },
  };
}

// ---------------------------------------------------------------- tape flute

/**
 * A flute on a tape-replay keyboard: a near-sine with a few soft harmonics and real breath, a vibrato that arrives late,
 * and the slow pitch sag of tape running through the whole thing. Short phrases of long notes, then bars of rest.
 */
export function createTapeFlute(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const hp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 220, Q: 0.6 });
  const sat = new WaveShaperNode(ctx, { curve: saturationCurve(1.4), oversample: '2x' });
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 8000, Q: 0.4 });
  hp.connect(sat).connect(lp).connect(out);
  const delay = new DelayNode(ctx, { maxDelayTime: 3, delayTime: 0.75 });
  const feedback = new GainNode(ctx, { gain: 0.25 });
  const loopFilter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1800 });
  const wet = new GainNode(ctx, { gain: 0.2 });
  lp.connect(delay).connect(loopFilter).connect(feedback).connect(delay);
  loopFilter.connect(wet).connect(out);
  const vibrato = new OscillatorNode(ctx, { frequency: 4.7 });
  const wow = new OscillatorNode(ctx, { frequency: 0.55 });
  const wowDepth = new GainNode(ctx, { gain: 5 });
  wow.connect(wowDepth);
  vibrato.start();
  wow.start();
  let phrase: { step: number; midi: number; beats: number }[] = [];
  let last = 72;

  function note(t: number, midi: number, hold: number, vel: number) {
    const f = midiToFreq(midi);
    const amp = new GainNode(ctx, { gain: 0 });
    const pan = new StereoPannerNode(ctx, { pan: rand(-0.2, 0.2) });
    amp.connect(pan).connect(hp);
    const vibDepth = new GainNode(ctx, { gain: 0 });
    vibrato.connect(vibDepth);
    vibDepth.gain.setValueAtTime(0, t + 0.35);
    vibDepth.gain.linearRampToValueAtTime(11, t + 1.1);
    const oscs = [
      { ratio: 1, gain: 1 },
      { ratio: 2, gain: 0.3 },
      { ratio: 3, gain: 0.14 },
      { ratio: 4, gain: 0.05 },
    ].map((p) => {
      const o = new OscillatorNode(ctx, { frequency: f * p.ratio });
      const g = new GainNode(ctx, { gain: p.gain });
      o.connect(g).connect(amp);
      vibDepth.connect(o.detune);
      wowDepth.connect(o.detune);
      return { o, g };
    });
    const breath = new AudioBufferSourceNode(ctx, { buffer: core.noise.get('pink'), loop: true });
    const breathBp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: f * 2.5, Q: 0.8 });
    const breathGain = new GainNode(ctx, { gain: 0.8 });
    breath.connect(breathBp).connect(breathGain).connect(amp);
    const end = envelope(amp.gain, t, hold, { peak: 0.16 * vel, attack: 0.09, decay: 0.4, sustain: 0.82, release: 0.55 });
    for (const { o } of oscs) o.start(t);
    startLoop(breath, t);
    const sources = oscs.map((x) => x.o);
    cleanupAt([...sources, breath], end, [amp, pan, vibDepth, breathBp, breathGain, ...oscs.map((x) => x.g)], () => {
      vibrato.disconnect(vibDepth);
      for (const o of sources) wowDepth.disconnect(o.detune);
    });
  }

  function makePhrase(s: StepInfo) {
    const pool = pentatonicNotes(s.root, 65, 84);
    let idx = pool.findIndex((m) => m >= last);
    if (idx < 0) idx = pool.length - 1;
    const length = randInt(2, 4);
    let step = pick([0, 2, 4]);
    phrase = [];
    for (let i = 0; i < length && step < 16; i++) {
      const beats = pick([1.5, 2, 3]);
      phrase.push({ step, midi: pool[idx], beats });
      idx = clamp(idx + pick([-2, -1, 1, 2]), 0, pool.length - 1);
      step += Math.round(beats * 4);
    }
    last = pool[idx];
  }

  return {
    output: out,
    setTempo(bpm) {
      glide(ctx, delay.delayTime, (60 / bpm) * 1.5, 0.5);
    },
    step(s) {
      if (s.stepInBar === 0) {
        phrase = [];
        // Rests of a bar or more: it should come and go, never take over.
        if (chance(0.3 + 0.2 * s.evolution)) makePhrase(s);
      }
      const hit = phrase.find((n) => n.step === s.stepInBar);
      if (hit) note(s.time + rand(0, 0.02), hit.midi, hit.beats * 4 * s.stepDur, rand(0.75, 1));
    },
    deactivate() {
      phrase = [];
    },
  };
}
