// Electric piano and choir: two more pad-category instruments, each with its own generator.
// The electric piano comps the chords in short rolled voicings; the choir holds them as soft vowels.
import { movementDepth, noteDensity } from '../evolution';
import { cleanupAt, envelope, glide } from '../params';
import { chance, pick, rand } from '../random';
import { startLoop } from '../noise';
import { createChorus, createDrift } from '../synth';
import { midiToFreq, placeInRange } from '../theory';
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
  const warmth = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 4200, Q: 0.4 });
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
    bodyIndex.gain.setTargetAtTime(f * 0.12, t, 0.5);
    const tine = new OscillatorNode(ctx, { frequency: f });
    const tineMod = new OscillatorNode(ctx, { frequency: f * 14 });
    const tineIndex = new GainNode(ctx, { gain: 0 });
    const tineGain = new GainNode(ctx, { gain: 0 });
    tineMod.connect(tineIndex).connect(tine.frequency);
    tineIndex.gain.setValueAtTime(f * 1.4 * vel, t);
    tineIndex.gain.setTargetAtTime(0, t, 0.08);
    tineGain.gain.setValueAtTime(0.35 * vel * vel, t);
    tineGain.gain.setTargetAtTime(0, t, 0.25);
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
    { f: 640, g: 0.3 },
    { f: 2700, g: 0.06 },
  ],
  oh: [
    { f: 450, g: 1 },
    { f: 800, g: 0.45 },
    { f: 2830, g: 0.08 },
  ],
  ah: [
    { f: 750, g: 1 },
    { f: 1150, g: 0.55 },
    { f: 2900, g: 0.1 },
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
    for (const o of oscs) o.start(t);
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
