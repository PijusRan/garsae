// Synthesized drum voices. Each call schedules one hit at time t.
import { percussive } from '../params';
import { rand } from '../random';
import { saturationCurve } from '../synth';
import type { NoiseBank } from '../noise';

export type Voice = 'kick' | 'snare' | 'rim' | 'clap' | 'hat' | 'openhat' | 'shaker' | 'tom' | 'ride' | 'brush' | 'slap';

export interface HitOpts {
  /** Pitch multiplier. */
  tone?: number;
  /** Decay multiplier. */
  decay?: number;
  /** Brush sweeps only: the colour moves down instead of up (the return half of a circle). */
  down?: boolean;
}

export interface Kit {
  ctx: BaseAudioContext;
  noise: NoiseBank;
}

function noiseSource(kit: Kit, t: number, dur: number): AudioBufferSourceNode {
  const buffer = kit.noise.hit;
  const src = new AudioBufferSourceNode(kit.ctx, { buffer });
  // A random start, but never so late that a long hit (a slow brush sweep) runs off the buffer's end.
  src.start(t, rand(0, Math.max(0, buffer.duration - dur - 0.06)), dur + 0.05);
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
  // Body: a sine that drops quickly from a punchy start to the fundamental, softly driven for weight.
  const osc = new OscillatorNode(ctx, { frequency: 150 * tone });
  osc.frequency.setValueAtTime(155 * tone, t);
  osc.frequency.exponentialRampToValueAtTime(48 * tone, t + 0.09);
  osc.frequency.exponentialRampToValueAtTime(44 * tone, t + decay);
  const g = new GainNode(ctx, { gain: 0 });
  const drive = new WaveShaperNode(ctx, { curve: saturationCurve(2) });
  const level = new GainNode(ctx, { gain: 0.8 });
  osc.connect(g).connect(drive).connect(level).connect(dest);
  const end = percussive(g.gain, t, 0.95 * vel, 0.002, decay);
  osc.start(t);
  osc.stop(end);
  release(osc, [g, drive, level]);

  // Beater click: a few milliseconds of band-limited noise.
  const n = noiseSource(kit, t, 0.02);
  const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 3200 * tone, Q: 0.8 });
  const ng = new GainNode(ctx, { gain: 0 });
  n.connect(bp).connect(ng).connect(dest);
  percussive(ng.gain, t, 0.22 * vel, 0.0005, 0.012);
  release(n, [bp, ng]);
}

function snare(kit: Kit, dest: AudioNode, t: number, vel: number, o: HitOpts) {
  const { ctx } = kit;
  const tone = o.tone ?? 1;
  const decay = o.decay ?? 1;
  // Two drum-shell modes, both dipping slightly in pitch as the head relaxes.
  for (const [f, peak, len] of [
    [185, 0.3, 0.12],
    [330, 0.14, 0.07],
  ]) {
    const body = new OscillatorNode(ctx, { type: 'sine', frequency: f * tone });
    body.frequency.setValueAtTime(f * 1.12 * tone, t);
    body.frequency.exponentialRampToValueAtTime(f * tone, t + 0.04);
    const bodyGain = new GainNode(ctx, { gain: 0 });
    body.connect(bodyGain).connect(dest);
    const bodyEnd = percussive(bodyGain.gain, t, peak * vel, 0.001, len * decay);
    body.start(t);
    body.stop(bodyEnd);
    release(body, [bodyGain]);
  }

  // The wires: broadband noise with the lows removed, and a brighter snap on top.
  const n = noiseSource(kit, t, 0.3 * decay);
  const hp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 1000 * tone, Q: 0.5 });
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 9000 });
  const ng = new GainNode(ctx, { gain: 0 });
  n.connect(hp).connect(lp).connect(ng).connect(dest);
  percussive(ng.gain, t, 0.36 * vel, 0.001, 0.22 * decay);
  const snap = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 4500 * tone, Q: 1 });
  const sg = new GainNode(ctx, { gain: 0 });
  n.connect(snap).connect(sg).connect(dest);
  percussive(sg.gain, t, 0.25 * vel, 0.001, 0.05 * decay);
  release(n, [hp, lp, ng, snap, sg]);
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

/** The TR-808's six square-wave oscillators (Hz). Their clash is what makes its hats and cymbals metallic. */
const METAL_808 = [205.3, 304.4, 369.6, 522.7, 540, 800];

function hat(kit: Kit, dest: AudioNode, t: number, vel: number, o: HitOpts, open: boolean) {
  const { ctx } = kit;
  const tone = o.tone ?? 1;
  const decay = (open ? 0.3 : 0.05) * (o.decay ?? 1);
  const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 10000 * tone, Q: 0.9 });
  const hp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 7000 * tone });
  const g = new GainNode(ctx, { gain: 0 });
  bp.connect(hp).connect(g).connect(dest);
  const end = percussive(g.gain, t, (open ? 0.22 : 0.34) * vel, 0.0008, decay);
  const metal = new GainNode(ctx, { gain: 0.6 });
  metal.connect(bp);
  const oscs = METAL_808.map((f) => {
    const osc = new OscillatorNode(ctx, { type: 'square', frequency: f * tone });
    osc.connect(metal);
    osc.start(t);
    osc.stop(end);
    return osc;
  });
  // A little noise keeps it airy rather than ringing.
  const n = noiseSource(kit, t, decay);
  const ng = new GainNode(ctx, { gain: 0.5 });
  n.connect(ng).connect(bp);
  release(oscs[0], [...oscs.slice(1), metal, bp, hp, g]);
  release(n, [ng]);
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

/** A brush swept in a circle across the snare head: a soft swell of filtered noise whose colour moves. */
function brush(kit: Kit, dest: AudioNode, t: number, vel: number, o: HitOpts) {
  const { ctx } = kit;
  const len = 0.32 * (o.decay ?? 1);
  const n = noiseSource(kit, t, len + 0.05);
  const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 2600 * (o.tone ?? 1), Q: 0.9 });
  const [from, to] = o.down ? [4200, 2200] : [2200, 4200];
  bp.frequency.setValueAtTime(from * (o.tone ?? 1), t);
  bp.frequency.linearRampToValueAtTime(to * (o.tone ?? 1), t + len);
  const g = new GainNode(ctx, { gain: 0 });
  n.connect(bp).connect(g).connect(dest);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.14 * vel, t + len * 0.55);
  g.gain.linearRampToValueAtTime(0, t + len);
  release(n, [bp, g]);
}

/** A brush slapped onto the snare: a soft-edged burst of wires with a faint drum body. */
function slap(kit: Kit, dest: AudioNode, t: number, vel: number, o: HitOpts) {
  const { ctx } = kit;
  const tone = o.tone ?? 1;
  const decay = 0.16 * (o.decay ?? 1);
  const n = noiseSource(kit, t, decay + 0.05);
  const hp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 1400 * tone, Q: 0.5 });
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 7000 * tone });
  const g = new GainNode(ctx, { gain: 0 });
  n.connect(hp).connect(lp).connect(g).connect(dest);
  // Bristles land over a few milliseconds, so the attack is softer than a stick.
  percussive(g.gain, t, 0.3 * vel, 0.006, decay);
  release(n, [hp, lp, g]);
  const body = new OscillatorNode(ctx, { frequency: 190 * tone });
  const bg = new GainNode(ctx, { gain: 0 });
  body.connect(bg).connect(dest);
  const end = percussive(bg.gain, t, 0.1 * vel, 0.004, 0.08);
  body.start(t);
  body.stop(end);
  release(body, [bg]);
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
    case 'brush':
      return brush(kit, dest, t, vel, o);
    case 'slap':
      return slap(kit, dest, t, vel, o);
  }
}
