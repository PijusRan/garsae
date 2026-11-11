// The synth voices the physical models replaced, kept as alternates for listening tests (compare.html). Each is the
// note function its tile used to have, playing into the tile's own chain, so A/B hears only the voice change.
import { cleanupAt, envelope, glide, percussive } from '../params';
import { startLoop } from '../noise';
import { clamp, rand } from '../random';
import { createDrift } from '../synth';
import { midiToFreq } from '../theory';
import type { Core } from '../types';
import type { ModelVoice, Vowel } from '../models/host';

/** Tape flute: a near-sine with soft harmonics, breath noise, a late vibrato and tape wow. */
export function synthFlute(core: Core, dest: AudioNode): ModelVoice {
  const { ctx } = core;
  const vibrato = new OscillatorNode(ctx, { frequency: 4.7 });
  const wow = new OscillatorNode(ctx, { frequency: 0.55 });
  const wowDepth = new GainNode(ctx, { gain: 5 });
  wow.connect(wowDepth);
  vibrato.start();
  wow.start();
  return {
    output: dest,
    note(t, midi, hold, vel) {
      const f = midiToFreq(midi);
      const amp = new GainNode(ctx, { gain: 0 });
      const pan = new StereoPannerNode(ctx, { pan: rand(-0.2, 0.2) });
      amp.connect(pan).connect(dest);
      const vibDepth = new GainNode(ctx, { gain: 0 });
      vibrato.connect(vibDepth);
      vibDepth.gain.setValueAtTime(0, t + 0.4);
      vibDepth.gain.linearRampToValueAtTime(8, t + 1.2);
      const oscs = [
        { ratio: 1, gain: 1 },
        { ratio: 2, gain: 0.16 },
        { ratio: 3, gain: 0.05 },
      ].map((p) => {
        const o = new OscillatorNode(ctx, { frequency: f * p.ratio });
        const g = new GainNode(ctx, { gain: p.gain });
        o.connect(g).connect(amp);
        vibDepth.connect(o.detune);
        wowDepth.connect(o.detune);
        return { o, g };
      });
      const breath = new AudioBufferSourceNode(ctx, { buffer: core.noise.get('pink'), loop: true });
      const breathBp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: f * 2, Q: 1.1 });
      const breathGain = new GainNode(ctx, { gain: 0 });
      breathGain.gain.setValueAtTime(0, t);
      breathGain.gain.linearRampToValueAtTime(0.5, t + 0.06);
      breathGain.gain.setTargetAtTime(0.18, t + 0.06, 0.15);
      breath.connect(breathBp).connect(breathGain).connect(amp);
      const peak = 0.1 * vel;
      const attack = 0.2;
      const relStart = t + Math.max(attack + 0.1, hold);
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(peak * 0.8, t + attack);
      amp.gain.linearRampToValueAtTime(peak, t + attack + (relStart - t - attack) * 0.4);
      amp.gain.linearRampToValueAtTime(peak * 0.7, relStart);
      amp.gain.setTargetAtTime(0, relStart, 0.12);
      for (const { o } of oscs) o.start(t);
      startLoop(breath, t);
      const sources = oscs.map((x) => x.o);
      cleanupAt([...sources, breath], relStart + 0.7, [amp, pan, vibDepth, breathBp, breathGain, ...oscs.map((x) => x.g)], () => {
        vibrato.disconnect(vibDepth);
        for (const o of sources) wowDepth.disconnect(o.detune);
      });
    },
  };
}

/** String ensemble: a 1970s string machine, three slightly detuned saws per note with a slow analog drift. */
export function synthStrings(core: Core, dest: AudioNode): ModelVoice {
  const { ctx } = core;
  const drift = createDrift(ctx, 4, 0.08);
  return {
    output: dest,
    note(t, midi, hold) {
      const f = midiToFreq(midi);
      const g = new GainNode(ctx, { gain: 0 });
      g.connect(dest);
      const oscs = [-7, 0.5, 8].map((d) => {
        const o = new OscillatorNode(ctx, { type: 'sawtooth', frequency: f, detune: d + rand(-1.5, 1.5) });
        o.connect(g);
        drift.connect(o.detune);
        return o;
      });
      const end = envelope(g.gain, t, hold, { peak: 0.035, attack: 1.3, release: 2.8 });
      for (const o of oscs) o.start(t + rand(0, 1 / f));
      cleanupAt(oscs, end, [g], () => {
        for (const o of oscs) drift.disconnect(o.detune);
      });
    },
  };
}

/** Formants (Hz) and relative gains for soft sung vowels. */
const VOWELS: Record<Vowel, { f: number; g: number }[]> = {
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
};

/** Choir: two detuned saws per voice with a delayed vibrato and breath, sung through one bank of vowel formants. */
export function synthChoir(core: Core, dest: AudioNode): ModelVoice {
  const { ctx } = core;
  const singers = new GainNode(ctx, { gain: 1 });
  const formants = VOWELS.oo.map((v) => {
    const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: v.f, Q: 7 });
    const g = new GainNode(ctx, { gain: v.g });
    singers.connect(bp).connect(g).connect(dest);
    return { bp, g };
  });
  const drift = createDrift(ctx, 5, 0.09);
  const vibrato = new OscillatorNode(ctx, { frequency: 5.1 });
  vibrato.start();
  return {
    output: dest,
    setVowel(vowel, t) {
      VOWELS[vowel].forEach((p, i) => {
        glide(ctx, formants[i].bp.frequency, p.f, 1.5, t);
        glide(ctx, formants[i].g.gain, p.g, 1.5, t);
      });
    },
    note(t, midi, hold, vel) {
      const f = midiToFreq(midi);
      const g = new GainNode(ctx, { gain: 0 });
      // The tenor sits a little right of centre, the upper parts spread across.
      const p = new StereoPannerNode(ctx, { pan: midi < 55 ? 0.2 : clamp((midi - 67) / 12, -0.4, 0.4) });
      g.connect(p).connect(singers);
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
      const end = envelope(g.gain, t, hold, { peak: 0.0625 * vel, attack: 2.2, release: 3.5 });
      for (const o of oscs) o.start(t + rand(0, 1 / f));
      startLoop(breath, t);
      cleanupAt([...oscs, breath], end, [g, p, vibDepth, breathGain], () => {
        vibrato.disconnect(vibDepth);
        for (const o of oscs) drift.disconnect(o.detune);
      });
    },
  };
}

/** String stiffness: overtones run sharp, f(n) = n·f·√(1 + B·n²). */
const PIANO_B = 0.00032;

/** Felt piano: additive stiff-string partials, the low ones doubled for a beating unison, with a felt thud. */
export function synthPiano(core: Core, dest: AudioNode): ModelVoice {
  const { ctx } = core;
  return {
    output: dest,
    note(t, midi, hold, vel) {
      const f = midiToFreq(midi);
      const pan = new StereoPannerNode(ctx, { pan: clamp((midi - 62) / 32, -0.45, 0.45) });
      const amp = new GainNode(ctx, { gain: 0.15 });
      amp.connect(pan).connect(dest);
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
      amp.gain.setValueAtTime(0.15, t + hold);
      amp.gain.setTargetAtTime(0, t + hold, 0.14);
      const thud = new AudioBufferSourceNode(ctx, { buffer: core.noise.hit });
      const thudLp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1800 });
      const thudGain = new GainNode(ctx, { gain: 0 });
      thud.connect(thudLp).connect(thudGain).connect(amp);
      percussive(thudGain.gain, t, 0.45 * vel, 0.002, 0.03);
      thud.start(t, rand(0, 1.5), 0.06);
      for (const o of oscs) o.start(t);
      cleanupAt(oscs, t + hold + 0.9, [...nodes, thud, thudLp, thudGain]);
    },
  };
}

/** Partials of an ideal free bar, with a beating twin of the fundamental. */
const BAR_PARTIALS = [
  { ratio: 1, detune: 0, gain: 0.11, decay: 4.6 },
  { ratio: 1, detune: 4, gain: 0.05, decay: 3.6 },
  { ratio: 2.756, detune: 0, gain: 0.04, decay: 1.5 },
  { ratio: 5.404, detune: 0, gain: 0.014, decay: 0.45 },
];

/** Glass bells: additive struck bars with a mallet tick. */
export function synthBells(core: Core, dest: AudioNode): ModelVoice {
  const { ctx } = core;
  return {
    output: dest,
    note(t, midi, _hold, vel) {
      const f = midiToFreq(midi);
      const pan = new StereoPannerNode(ctx, { pan: rand(-0.6, 0.6) });
      const amp = new GainNode(ctx, { gain: vel });
      amp.connect(pan).connect(dest);
      const oscs: OscillatorNode[] = [];
      const nodes: AudioNode[] = [amp, pan];
      let end = t;
      for (const p of BAR_PARTIALS) {
        const osc = new OscillatorNode(ctx, { frequency: f * p.ratio, detune: p.detune });
        const g = new GainNode(ctx, { gain: 0 });
        osc.connect(g).connect(amp);
        const level = p.gain * (p.ratio > 2 ? vel : 1);
        end = Math.max(end, percussive(g.gain, t, level, 0.002, p.decay));
        oscs.push(osc);
        nodes.push(g);
      }
      const strike = new AudioBufferSourceNode(ctx, { buffer: core.noise.hit });
      const strikeBp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: Math.min(f * 4, 9000), Q: 1.5 });
      const strikeGain = new GainNode(ctx, { gain: 0 });
      strike.connect(strikeBp).connect(strikeGain).connect(amp);
      percussive(strikeGain.gain, t, 0.05 * vel, 0.001, 0.025);
      strike.start(t, rand(0, 1.5), 0.05);
      for (const o of oscs) o.start(t);
      cleanupAt(oscs, end, [...nodes, strike, strikeBp, strikeGain]);
    },
  };
}

/** Walking bass: a saw and a triangle through a closing lowpass, a pitch settling from sharp, and a finger thump. */
export function synthWalk(core: Core, dest: AudioNode): ModelVoice {
  const { ctx } = core;
  return {
    output: dest,
    note(t, midi, dur, vel) {
      const f = midiToFreq(midi);
      const g = new GainNode(ctx, { gain: 0 });
      const tone = new BiquadFilterNode(ctx, { type: 'lowpass', Q: 0.9, frequency: 500 + 900 * vel });
      tone.frequency.setTargetAtTime(f * 5, t + 0.01, 0.12);
      const a = new OscillatorNode(ctx, { type: 'sawtooth', frequency: f });
      const b = new OscillatorNode(ctx, { type: 'triangle', frequency: f });
      const sawGain = new GainNode(ctx, { gain: 0.7 });
      for (const o of [a, b]) {
        o.detune.setValueAtTime(14, t);
        o.detune.setTargetAtTime(0, t, 0.02);
      }
      a.connect(sawGain).connect(tone);
      b.connect(tone);
      tone.connect(g).connect(dest);
      const end = envelope(g.gain, t, dur, { peak: 0.34 * vel, attack: 0.006, decay: 0.45, sustain: 0.35, release: 0.12 });
      const thump = new AudioBufferSourceNode(ctx, { buffer: core.noise.hit });
      const thumpLp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 380 });
      const thumpGain = new GainNode(ctx, { gain: 0 });
      thump.connect(thumpLp).connect(thumpGain).connect(dest);
      percussive(thumpGain.gain, t, 0.5 * vel, 0.002, 0.035);
      thump.start(t, rand(0, 1.5), 0.06);
      a.start(t);
      b.start(t);
      cleanupAt([a, b], end, [g, tone, sawGain, thump, thumpLp, thumpGain]);
    },
  };
}

/** Muted bass: a triangle and a little saw through the tile's dark filter, with a finger thud. */
export function synthMuted(core: Core, dest: AudioNode): ModelVoice {
  const { ctx } = core;
  return {
    output: dest,
    note(t, midi, len, vel) {
      const f = midiToFreq(midi);
      const tri = new OscillatorNode(ctx, { type: 'triangle', frequency: f });
      const saw = new OscillatorNode(ctx, { type: 'sawtooth', frequency: f });
      const sawGain = new GainNode(ctx, { gain: 0.25 });
      const g = new GainNode(ctx, { gain: 0 });
      tri.connect(g);
      saw.connect(sawGain).connect(g);
      g.connect(dest);
      const end = envelope(g.gain, t, len, { peak: 0.52 * vel, attack: 0.004, decay: 0.22, sustain: 0.3, release: 0.05 });
      const thud = new AudioBufferSourceNode(ctx, { buffer: core.noise.hit });
      const thudLp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 420 });
      const thudGain = new GainNode(ctx, { gain: 0 });
      thud.connect(thudLp).connect(thudGain).connect(dest);
      percussive(thudGain.gain, t, 0.5 * vel, 0.002, 0.03);
      thud.start(t, rand(0, 1.5), 0.05);
      tri.start(t);
      saw.start(t);
      cleanupAt([tri, saw], end, [sawGain, g, thud, thudLp, thudGain]);
    },
  };
}

/** 808 bass: a sine diving from twice the note into a long decay, each boom cutting off the last. */
export function synth808(core: Core, dest: AudioNode): ModelVoice {
  const { ctx } = core;
  let current: GainNode | null = null;
  return {
    output: dest,
    note(t, midi, len, vel) {
      const f = midiToFreq(midi);
      current?.gain.setTargetAtTime(0, t - 0.006, 0.004);
      const osc = new OscillatorNode(ctx, { frequency: f * 2.1 });
      osc.frequency.setValueAtTime(f * 2.1, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + 0.045);
      const g = new GainNode(ctx, { gain: 0 });
      osc.connect(g).connect(dest);
      const end = percussive(g.gain, t, 0.72 * vel, 0.003, len);
      osc.start(t);
      cleanupAt([osc], end, [g]);
      current = g;
    },
  };
}
