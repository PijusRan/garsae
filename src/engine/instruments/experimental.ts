// Experimental tiles: noise colours, amplitude modulation, binaural and isochronic
// tones, granular cloud and tape wobble. No claims are made about any of them.
import { movementDepth, noteDensity } from '../evolution';
import { glide } from '../params';
import { chance, pick, rand } from '../random';
import { startLoop, type NoiseColor } from '../noise';
import { chordInPentatonic, midiToFreq, notesInRange, placeInRange } from '../theory';
import type { Core, Instrument } from '../types';

/** Beta-range rate shared by AM, binaural and isochronic tiles. */
export const BETA_HZ = 14;
export const AM_RATE_HZ = 16;

// ---------------------------------------------------------------- noise colours

export function createNoise(color: NoiseColor | 'green') {
  return (core: Core): Instrument => {
    const { ctx } = core;
    const out = new GainNode(ctx, { gain: 1 });
    let head: AudioNode;
    if (color === 'green') {
      // "Green" noise: pink noise focused on the middle of the spectrum, around 500 Hz.
      const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 500, Q: 0.55 });
      const makeUp = new GainNode(ctx, { gain: 2.2 });
      bp.connect(makeUp).connect(out);
      head = bp;
    } else if (color === 'pink') {
      const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 9000 });
      lp.connect(out);
      head = lp;
    } else {
      head = out;
    }
    let src: AudioBufferSourceNode | undefined;
    return {
      output: out,
      activate(t) {
        src = core.noise.loop(color === 'green' ? 'pink' : color);
        src.connect(head);
        startLoop(src, t);
      },
      deactivate() {
        src?.stop();
        src?.disconnect();
        src = undefined;
      },
    };
  };
}

// ---------------------------------------------------------------- effect tiles

export function createAmplitudeMod(core: Core): Instrument {
  return {
    setLevel(level) {
      // Full volume = 50% dips. The design keeps this gentle.
      core.master.setModulation({ rate: AM_RATE_HZ, depth: level * 0.5 });
    },
  };
}

export function createWobble(core: Core): Instrument {
  return {
    setLevel(level) {
      core.master.setWobble(level);
    },
  };
}

// ---------------------------------------------------------------- binaural / isochronic

export function createBinaural(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const merger = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
  merger.connect(out);
  let left: OscillatorNode | undefined;
  let right: OscillatorNode | undefined;
  const carrier = (root: number) => midiToFreq(placeInRange(root, 48));

  return {
    output: out,
    activate(t) {
      const f = carrier(core.root);
      left = new OscillatorNode(ctx, { frequency: f - BETA_HZ / 2 });
      right = new OscillatorNode(ctx, { frequency: f + BETA_HZ / 2 });
      left.connect(merger, 0, 0);
      right.connect(merger, 0, 1);
      left.start(t);
      right.start(t);
    },
    deactivate() {
      for (const o of [left, right]) {
        o?.stop();
        o?.disconnect();
      }
      left = right = undefined;
    },
    setKey(root) {
      const f = carrier(root);
      if (left) glide(ctx, left.frequency, f - BETA_HZ / 2, 1.5);
      if (right) glide(ctx, right.frequency, f + BETA_HZ / 2, 1.5);
    },
  };
}

function softSquareCurve(k = 3): Float32Array<ArrayBuffer> {
  const n = 1025;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

export function createIsochronic(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const gate = new GainNode(ctx, { gain: 0.5 });
  const shaper = new WaveShaperNode(ctx, { curve: softSquareCurve() });
  const depth = new GainNode(ctx, { gain: 0.5 });
  // Rounded on/off pulses: gain swings between 0 and 1 at the beat rate.
  shaper.connect(depth).connect(gate.gain);
  gate.connect(out);
  let tone: OscillatorNode | undefined;
  let lfo: OscillatorNode | undefined;
  const carrier = (root: number) => midiToFreq(placeInRange(root, 57));

  return {
    output: out,
    activate(t) {
      tone = new OscillatorNode(ctx, { frequency: carrier(core.root) });
      lfo = new OscillatorNode(ctx, { frequency: BETA_HZ });
      tone.connect(gate);
      lfo.connect(shaper);
      tone.start(t);
      lfo.start(t);
    },
    deactivate() {
      for (const o of [tone, lfo]) {
        o?.stop();
        o?.disconnect();
      }
      tone = lfo = undefined;
    },
    setKey(root) {
      if (tone) glide(ctx, tone.frequency, carrier(root), 1.5);
    },
  };
}

// ---------------------------------------------------------------- granular cloud

function hann(n: number, amp: number): Float32Array<ArrayBuffer> {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = amp * 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return c;
}

export function createGrains(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 4500 });
  lp.connect(out);

  function grain(t: number, midi: number) {
    const dur = rand(0.12, 0.5);
    const osc = new OscillatorNode(ctx, {
      type: pick(['sine', 'sine', 'triangle'] as OscillatorType[]),
      frequency: midiToFreq(midi),
      detune: rand(-9, 9),
    });
    const g = new GainNode(ctx, { gain: 0 });
    const p = new StereoPannerNode(ctx, { pan: rand(-0.85, 0.85) });
    osc.connect(g).connect(p).connect(lp);
    g.gain.setValueCurveAtTime(hann(48, rand(0.03, 0.075)), t, dur);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
      p.disconnect();
    };
  }

  return {
    output: out,
    setEvolution(e) {
      glide(ctx, lp.frequency, 3000 + 3500 * movementDepth(e), 1);
    },
    step(s) {
      const perSecond = 6 * noteDensity(s.evolution);
      const expected = perSecond * s.stepDur;
      const count = Math.floor(expected) + (chance(expected % 1) ? 1 : 0);
      if (count === 0) return;
      const pool = notesInRange(chordInPentatonic(s.root, s.chord), 72, 96);
      for (let i = 0; i < count; i++) grain(s.time + rand(0, s.stepDur), pick(pool));
    },
  };
}
