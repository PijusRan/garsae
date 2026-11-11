// Synthesized drum voices. Each call schedules one hit at time t.
import { percussive } from '../params';
import { rand } from '../random';
import { saturationCurve } from '../synth';
import type { NoiseBank } from '../noise';

export type Voice = 'kick' | 'snare' | 'rim' | 'clap' | 'hat' | 'openhat' | 'shaker' | 'tom' | 'ride' | 'conga' | 'congaslap';

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
  const buffer = kit.noise.hit;
  const src = new AudioBufferSourceNode(kit.ctx, { buffer });
  // A random start, but never so late that a long hit runs off the buffer's end.
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
  // Well below the rest of the kit. A kick this low in pitch carries far more energy than it sounds like.
  const level = new GainNode(ctx, { gain: 0.26 });
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
  percussive(ng.gain, t, 0.3 * vel, 0.0005, 0.014);
  release(n, [bp, ng]);
}

function snare(kit: Kit, dest: AudioNode, t: number, vel: number, o: HitOpts) {
  const { ctx } = kit;
  const tone = o.tone ?? 1;
  const decay = o.decay ?? 1;
  // Two drum-shell modes, both dipping slightly in pitch as the head relaxes.
  for (const [f, peak, len] of [
    [185, 0.42, 0.12],
    [330, 0.24, 0.07],
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
  percussive(ng.gain, t, 0.62 * vel, 0.001, 0.22 * decay);
  const snap = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 4500 * tone, Q: 1 });
  const sg = new GainNode(ctx, { gain: 0 });
  n.connect(snap).connect(sg).connect(dest);
  percussive(sg.gain, t, 0.42 * vel, 0.001, 0.05 * decay);
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
  const peak = 0.8 * vel;
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
  const end = percussive(g.gain, t, (open ? 0.34 : 0.52) * vel, 0.0008, decay);
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

/**
 * A conga played with the hands. A struck skin: its fundamental settling a few percent in pitch as the head relaxes,
 * the membrane's overtones (about 1.5 and 2.2 times, not a string's 2 and 3) fading first, and the soft thud of the
 * palm. Open tones ring; a short decay makes the muted heel and toe strokes. Tone 1 is a conga around 220 Hz.
 */
function conga(kit: Kit, dest: AudioNode, t: number, vel: number, o: HitOpts) {
  const { ctx } = kit;
  const f = 220 * (o.tone ?? 1);
  const len = 0.34 * (o.decay ?? 1);
  for (const [ratio, level, d] of [
    [1, 0.6, len],
    [1.52, 0.16, len * 0.45],
    [2.24, 0.05, len * 0.25],
  ]) {
    const osc = new OscillatorNode(ctx, { frequency: f * ratio });
    osc.frequency.setValueAtTime(f * ratio * 1.05, t);
    osc.frequency.exponentialRampToValueAtTime(f * ratio, t + 0.035);
    const g = new GainNode(ctx, { gain: 0 });
    osc.connect(g).connect(dest);
    const end = percussive(g.gain, t, level * vel, 0.002, d);
    osc.start(t);
    osc.stop(end);
    release(osc, [g]);
  }
  // The palm landing: a few ms of muffled noise.
  const n = noiseSource(kit, t, 0.03);
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1300 * (o.tone ?? 1), Q: 0.7 });
  const ng = new GainNode(ctx, { gain: 0 });
  n.connect(lp).connect(ng).connect(dest);
  percussive(ng.gain, t, 0.3 * vel, 0.001, 0.02);
  release(n, [lp, ng]);
}

/**
 * A conga slap: cupped fingers snapping on the edge. A short pop of mid-high noise with the skin's overtone under it
 * and little of the fundamental. Rounded off on top, so it pops rather than cracks.
 */
function congaSlap(kit: Kit, dest: AudioNode, t: number, vel: number, o: HitOpts) {
  const { ctx } = kit;
  const tone = o.tone ?? 1;
  const f = 220 * tone;
  const n = noiseSource(kit, t, 0.1);
  const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 1900 * tone, Q: 1 });
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 5000, Q: 0.5 });
  const ng = new GainNode(ctx, { gain: 0 });
  n.connect(bp).connect(lp).connect(ng).connect(dest);
  percussive(ng.gain, t, 2.4 * vel, 0.002, 0.07 * (o.decay ?? 1));
  release(n, [bp, lp, ng]);
  for (const [ratio, level, d] of [
    [1, 0.2, 0.07],
    [1.52, 0.28, 0.09],
  ]) {
    const osc = new OscillatorNode(ctx, { frequency: f * ratio * 1.03 });
    osc.frequency.exponentialRampToValueAtTime(f * ratio, t + 0.03);
    const g = new GainNode(ctx, { gain: 0 });
    osc.connect(g).connect(dest);
    const end = percussive(g.gain, t, level * vel, 0.002, d);
    osc.start(t);
    osc.stop(end);
    release(osc, [g]);
  }
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
    case 'conga':
      return conga(kit, dest, t, vel, o);
    case 'congaslap':
      return congaSlap(kit, dest, t, vel, o);
  }
}
