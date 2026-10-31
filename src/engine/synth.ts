// Shared building blocks that make the synthesized instruments sound less static:
// a stereo ensemble chorus, slow analog-style pitch drift and soft saturation.

/** tanh soft clipping, normalised so ±1 still maps to ±1. Cached per drive. */
const curves = new Map<number, Float32Array<ArrayBuffer>>();
export function saturationCurve(drive: number): Float32Array<ArrayBuffer> {
  let c = curves.get(drive);
  if (c) return c;
  const n = 1025;
  c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(drive * x) / Math.tanh(drive);
  }
  curves.set(drive, c);
  return c;
}

export interface ChorusOptions {
  /** Centre delay in seconds. */
  delay?: number;
  /** How far the delay swings either side, in seconds. */
  depth?: number;
  /** LFO rate in Hz. */
  rate?: number;
  /** Wet level; the dry signal stays at full level. */
  wet?: number;
}

/**
 * A Juno-style ensemble: the signal is summed to mono and sent through two short
 * delays modulated in opposite phase, one per side, over the untouched dry signal.
 * Static oscillators become wide and alive without any audible vibrato.
 */
export function createChorus(ctx: BaseAudioContext, o: ChorusOptions = {}): { input: AudioNode; output: AudioNode } {
  const delay = o.delay ?? 0.0035;
  const depth = o.depth ?? 0.0017;
  const rate = o.rate ?? 0.51;
  const input = new GainNode(ctx);
  const output = new GainNode(ctx);
  input.connect(output);
  const merger = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
  const wet = new GainNode(ctx, { gain: o.wet ?? 0.7 });
  merger.connect(wet).connect(output);
  const lfo = new OscillatorNode(ctx, { type: 'triangle', frequency: rate });
  for (const [side, sign] of [
    [0, 1],
    [1, -1],
  ] as const) {
    const d = new DelayNode(ctx, { maxDelayTime: 0.05, delayTime: delay });
    const amount = new GainNode(ctx, { gain: sign * depth });
    lfo.connect(amount).connect(d.delayTime);
    input.connect(d).connect(merger, 0, side);
  }
  lfo.start();
  return { input, output };
}

/**
 * Slow, never-repeating pitch drift for oscillator `detune` params, in cents:
 * two sines at unrelated rates, like an analog synth that is never quite in tune.
 * Connect with `drift.connect(osc.detune)` and disconnect when the voice ends.
 */
export function createDrift(ctx: BaseAudioContext, cents: number, rate = 0.11): GainNode {
  const out = new GainNode(ctx, { gain: cents * 0.6 });
  const a = new OscillatorNode(ctx, { frequency: rate });
  const b = new OscillatorNode(ctx, { frequency: rate * 2.71 });
  const bg = new GainNode(ctx, { gain: 0.5 });
  a.connect(out);
  b.connect(bg).connect(out);
  a.start();
  b.start();
  return out;
}
