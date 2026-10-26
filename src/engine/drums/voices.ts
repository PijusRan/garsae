// Synthesized drum voices. Each call schedules one hit at time t.
import { percussive } from '../params';
import { rand } from '../random';
import type { NoiseBank } from '../noise';

export type Voice = 'kick' | 'snare' | 'rim' | 'clap' | 'hat' | 'openhat' | 'shaker' | 'tom' | 'ride';

export interface HitOpts {
  /** Pitch multiplier. */
  tone?: number;
  /** Decay multiplier. */
  decay?: number;
}

export interface Kit {
  ctx: BaseAudioContext;
  noise: NoiseBank;
}

function noiseSource(kit: Kit, t: number, dur: number): AudioBufferSourceNode {
  const src = new AudioBufferSourceNode(kit.ctx, { buffer: kit.noise.hit });
  src.start(t, rand(0, 1.5), dur + 0.05);
  return src;
}

function release(src: AudioScheduledSourceNode, nodes: AudioNode[]): void {
  src.onended = () => {
    src.disconnect();
    for (const n of nodes) n.disconnect();
  };
}

function kick(kit: Kit, dest: AudioNode, t: number, vel: number, o: HitOpts) {
  const { ctx } = kit;
  const tone = o.tone ?? 1;
  const decay = 0.42 * (o.decay ?? 1);
  const osc = new OscillatorNode(ctx, { frequency: 110 * tone });
  const g = new GainNode(ctx, { gain: 0 });
  osc.frequency.setValueAtTime(115 * tone, t);
  osc.frequency.exponentialRampToValueAtTime(46 * tone, t + 0.11);
  osc.connect(g).connect(dest);
  const end = percussive(g.gain, t, 0.95 * vel, 0.003, decay);
  osc.start(t);
  osc.stop(end);
  release(osc, [g]);
}

function snare(kit: Kit, dest: AudioNode, t: number, vel: number, o: HitOpts) {
  const { ctx } = kit;
  const tone = o.tone ?? 1;
  const decay = o.decay ?? 1;
  const body = new OscillatorNode(ctx, { type: 'triangle', frequency: 190 * tone });
  body.frequency.setValueAtTime(200 * tone, t);
  body.frequency.exponentialRampToValueAtTime(165 * tone, t + 0.08);
  const bodyGain = new GainNode(ctx, { gain: 0 });
  body.connect(bodyGain).connect(dest);
  const bodyEnd = percussive(bodyGain.gain, t, 0.38 * vel, 0.002, 0.11 * decay);
  body.start(t);
  body.stop(bodyEnd);
  release(body, [bodyGain]);

  const n = noiseSource(kit, t, 0.25 * decay);
  const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 1900 * tone, Q: 0.7 });
  const ng = new GainNode(ctx, { gain: 0 });
  n.connect(bp).connect(ng).connect(dest);
  percussive(ng.gain, t, 0.5 * vel, 0.002, 0.19 * decay);
  release(n, [bp, ng]);
}

function rim(kit: Kit, dest: AudioNode, t: number, vel: number, o: HitOpts) {
  const { ctx } = kit;
  const tone = o.tone ?? 1;
  const g = new GainNode(ctx, { gain: 0 });
  const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 1700 * tone, Q: 2 });
  const a = new OscillatorNode(ctx, { type: 'triangle', frequency: 820 * tone });
  const b = new OscillatorNode(ctx, { type: 'sine', frequency: 1630 * tone });
  a.connect(bp);
  b.connect(bp);
  bp.connect(g).connect(dest);
  const end = percussive(g.gain, t, 0.55 * vel, 0.001, 0.045 * (o.decay ?? 1));
  a.start(t);
  b.start(t);
  a.stop(end);
  b.stop(end);
  release(a, [b, bp, g]);
}

function clap(kit: Kit, dest: AudioNode, t: number, vel: number, o: HitOpts) {
  const { ctx } = kit;
  const decay = 0.17 * (o.decay ?? 1);
  const n = noiseSource(kit, t, decay + 0.05);
  const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 1150 * (o.tone ?? 1), Q: 1.1 });
  const g = new GainNode(ctx, { gain: 0 });
  n.connect(bp).connect(g).connect(dest);
  const peak = 0.55 * vel;
  // Three quick bursts, then a short tail.
  g.gain.setValueAtTime(0, t);
  for (const off of [0, 0.011, 0.022]) {
    g.gain.setValueAtTime(peak, t + off);
    g.gain.exponentialRampToValueAtTime(peak * 0.15, t + off + 0.009);
  }
  g.gain.setValueAtTime(peak * 0.8, t + 0.031);
  g.gain.exponentialRampToValueAtTime(0.0005, t + 0.031 + decay);
  g.gain.setValueAtTime(0, t + 0.032 + decay);
  release(n, [bp, g]);
}

function hat(kit: Kit, dest: AudioNode, t: number, vel: number, o: HitOpts, open: boolean) {
  const { ctx } = kit;
  const decay = (open ? 0.28 : 0.045) * (o.decay ?? 1);
  const n = noiseSource(kit, t, decay);
  const hp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 7000 * (o.tone ?? 1) });
  const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 10000 * (o.tone ?? 1), Q: 0.6 });
  const g = new GainNode(ctx, { gain: 0 });
  n.connect(hp).connect(bp).connect(g).connect(dest);
  percussive(g.gain, t, (open ? 0.2 : 0.32) * vel, 0.001, decay);
  release(n, [hp, bp, g]);
}

function shaker(kit: Kit, dest: AudioNode, t: number, vel: number, o: HitOpts) {
  const { ctx } = kit;
  const decay = 0.08 * (o.decay ?? 1);
  const n = noiseSource(kit, t, decay + 0.03);
  const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 5200 * (o.tone ?? 1), Q: 1.4 });
  const g = new GainNode(ctx, { gain: 0 });
  n.connect(bp).connect(g).connect(dest);
  // A slower attack makes it breathy rather than clicky.
  percussive(g.gain, t, 0.3 * vel, 0.018, decay);
  release(n, [bp, g]);
}

function tom(kit: Kit, dest: AudioNode, t: number, vel: number, o: HitOpts) {
  const { ctx } = kit;
  const tone = o.tone ?? 1;
  const osc = new OscillatorNode(ctx, { frequency: 150 * tone });
  osc.frequency.setValueAtTime(165 * tone, t);
  osc.frequency.exponentialRampToValueAtTime(105 * tone, t + 0.2);
  const g = new GainNode(ctx, { gain: 0 });
  osc.connect(g).connect(dest);
  const end = percussive(g.gain, t, 0.5 * vel, 0.004, 0.38 * (o.decay ?? 1));
  osc.start(t);
  osc.stop(end);
  release(osc, [g]);
}

const RIDE_RATIOS = [2, 3, 4.16, 5.43, 6.79, 8.21];

function ride(kit: Kit, dest: AudioNode, t: number, vel: number, o: HitOpts) {
  const { ctx } = kit;
  const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 8500, Q: 0.8 });
  const hp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 5500 });
  const g = new GainNode(ctx, { gain: 0 });
  bp.connect(hp).connect(g).connect(dest);
  const end = percussive(g.gain, t, 0.1 * vel, 0.002, 0.55 * (o.decay ?? 1));
  const oscs = RIDE_RATIOS.map((r) => {
    const osc = new OscillatorNode(ctx, { type: 'square', frequency: 52 * r * (o.tone ?? 1) });
    osc.connect(bp);
    osc.start(t);
    osc.stop(end);
    return osc;
  });
  release(oscs[0], [...oscs.slice(1), bp, hp, g]);
}

export function playHit(kit: Kit, voice: Voice, dest: AudioNode, t: number, vel: number, o: HitOpts = {}): void {
  switch (voice) {
    case 'kick':
      return kick(kit, dest, t, vel, o);
    case 'snare':
      return snare(kit, dest, t, vel, o);
    case 'rim':
      return rim(kit, dest, t, vel, o);
    case 'clap':
      return clap(kit, dest, t, vel, o);
    case 'hat':
      return hat(kit, dest, t, vel, o, false);
    case 'openhat':
      return hat(kit, dest, t, vel, o, true);
    case 'shaker':
      return shaker(kit, dest, t, vel, o);
    case 'tom':
      return tom(kit, dest, t, vel, o);
    case 'ride':
      return ride(kit, dest, t, vel, o);
  }
}
