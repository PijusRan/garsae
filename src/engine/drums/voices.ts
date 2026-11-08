// Synthesized drum voices. Each call schedules one hit at time t.
import { percussive } from '../params';
import { rand } from '../random';
import { saturationCurve } from '../synth';
import type { NoiseBank } from '../noise';

export type Voice = 'kick' | 'snare' | 'rim' | 'clap' | 'hat' | 'openhat' | 'shaker' | 'tom' | 'ride' | 'brush' | 'slap' | 'jazzride' | 'chick';

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
 * A brush swept in a circle across a coated snare head. Two layers of noise: the bristles'
 * scratch (2-7 kHz) and the head itself answering in the mids (500-1200 Hz), which is what
 * makes it a drum rather than hiss. A slow random tremor on the level is the bristles catching
 * the coating. The stroke speeds up into the beat and trails off, so the circle has a pulse.
 */
function brush(kit: Kit, dest: AudioNode, t: number, vel: number, o: HitOpts) {
  const { ctx } = kit;
  const tone = o.tone ?? 1;
  const len = 0.32 * (o.decay ?? 1);
  const n = noiseSource(kit, t, len + 0.05);

  const scratch = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 4000 * tone, Q: 0.55 });
  // The brush moves faster through the middle of the circle, and faster means brighter.
  const [from, to] = o.down ? [4800, 3200] : [3200, 4800];
  scratch.frequency.setValueAtTime(from * tone, t);
  scratch.frequency.linearRampToValueAtTime(to * tone, t + len * 0.6);
  scratch.frequency.linearRampToValueAtTime(((from + to) / 2) * tone, t + len);
  const scratchTop = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 6500 * tone, Q: 0.5 });
  const scratchGain = new GainNode(ctx, { gain: 0.8 });
  const head = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 800 * tone, Q: 0.8 });
  const headGain = new GainNode(ctx, { gain: 2.2 });

  // Grain: the level wobbles by about +-30% at a few tens of hertz. White noise lowpassed
  // at 35 Hz keeps only about 4% of its level, hence the large depth.
  const grain = new GainNode(ctx, { gain: 1 });
  const wobble = noiseSource(kit, t, len + 0.05);
  const wobbleLp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 35, Q: 0.7 });
  const wobbleDepth = new GainNode(ctx, { gain: 28 });
  wobble.connect(wobbleLp).connect(wobbleDepth).connect(grain.gain);

  const g = new GainNode(ctx, { gain: 0 });
  n.connect(scratch).connect(scratchTop).connect(scratchGain).connect(grain);
  n.connect(head).connect(headGain).connect(grain);
  grain.connect(g).connect(dest);
  // In with the beat over a few tens of ms, a gentle peak, then a long tail into the next stroke.
  const peak = 0.09 * vel;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak * 0.75, t + 0.03);
  g.gain.linearRampToValueAtTime(peak, t + len * 0.3);
  g.gain.linearRampToValueAtTime(peak * 0.35, t + len * 0.85);
  g.gain.linearRampToValueAtTime(0, t + len);
  release(n, [scratch, scratchTop, scratchGain, head, headGain, grain, g]);
  release(wobble, [wobbleLp, wobbleDepth]);
}

/** A brush slapped onto the snare: the head's thump, a burst of wires and a faint shell tone. */
function slap(kit: Kit, dest: AudioNode, t: number, vel: number, o: HitOpts) {
  const { ctx } = kit;
  const tone = o.tone ?? 1;
  const decay = 0.15 * (o.decay ?? 1);
  const n = noiseSource(kit, t, decay + 0.05);
  // The head: a short band of mids. This is most of a brush pat's weight.
  const head = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 700 * tone, Q: 0.9 });
  const hg = new GainNode(ctx, { gain: 0 });
  n.connect(head).connect(hg).connect(dest);
  percussive(hg.gain, t, 0.8 * vel, 0.004, decay * 0.5);
  // The wires: brighter and a little longer. Bristles land over a few ms, so no stick crack.
  const hp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 1800 * tone, Q: 0.5 });
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 8000 * tone });
  const wg = new GainNode(ctx, { gain: 0 });
  n.connect(hp).connect(lp).connect(wg).connect(dest);
  percussive(wg.gain, t, 0.32 * vel, 0.006, decay);
  release(n, [head, hg, hp, lp, wg]);
  const body = new OscillatorNode(ctx, { frequency: 200 * tone });
  body.frequency.setValueAtTime(215 * tone, t);
  body.frequency.exponentialRampToValueAtTime(195 * tone, t + 0.05);
  const bg = new GainNode(ctx, { gain: 0 });
  body.connect(bg).connect(dest);
  const end = percussive(bg.gain, t, 0.12 * vel, 0.003, 0.09);
  body.start(t);
  body.stop(end);
  release(body, [bg]);
}

/**
 * A jazz ride played with a stick: a bright "ping" from a cluster of inharmonic sine partials
 * (the higher ones fade first, as on a real cymbal), a soft wash of high noise that rings on,
 * and a tiny wooden tick from the stick tip. The partials are a cymbal's, not a chord's, so
 * it shimmers instead of buzzing.
 */
const JAZZ_RIDE_PARTIALS: [number, number, number][] = [
  // [Hz, level, decay s]
  [612, 0.08, 1.6],
  [1063, 0.14, 1.4],
  [1527, 0.18, 1.2],
  [2234, 0.3, 1.0],
  [2981, 0.4, 0.85],
  [3672, 0.5, 0.7],
  [4418, 0.5, 0.6],
  [5361, 0.45, 0.5],
  [6670, 0.35, 0.4],
  [8125, 0.25, 0.3],
];

function jazzRide(kit: Kit, dest: AudioNode, t: number, vel: number, o: HitOpts) {
  const { ctx } = kit;
  const tone = o.tone ?? 1;
  const decay = o.decay ?? 1;
  const sum = new GainNode(ctx, { gain: 0.07 * vel });
  // The partials alone are a little pure; a highpass keeps the ride off the piano's range.
  const hp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 900, Q: 0.5 });
  sum.connect(hp).connect(dest);
  const oscs: OscillatorNode[] = [];
  const nodes: AudioNode[] = [sum, hp];
  for (const [f, level, d] of JAZZ_RIDE_PARTIALS) {
    const osc = new OscillatorNode(ctx, { frequency: f * tone * rand(0.995, 1.005) });
    const g = new GainNode(ctx, { gain: 0 });
    osc.connect(g).connect(sum);
    const end = percussive(g.gain, t, level, 0.001, d * decay);
    osc.start(t);
    osc.stop(end);
    oscs.push(osc);
    nodes.push(g);
  }
  // Release everything once the longest partial is done.
  const longest = oscs[0];
  longest.onended = () => {
    for (const s of oscs) s.disconnect();
    for (const nd of nodes) nd.disconnect();
  };

  // The wash: high noise, swelling out of the ping and ringing on.
  const wash = noiseSource(kit, t, 1.3 * decay);
  const wbp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 7500 * tone, Q: 0.7 });
  const whp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 4500 });
  const wg = new GainNode(ctx, { gain: 0 });
  wash.connect(wbp).connect(whp).connect(wg).connect(dest);
  percussive(wg.gain, t, 0.1 * vel, 0.008, 1.2 * decay);
  release(wash, [wbp, whp, wg]);

  // The stick tip: a few ms of bright noise.
  const tick = noiseSource(kit, t, 0.015);
  const tbp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 5200, Q: 1.2 });
  const tg = new GainNode(ctx, { gain: 0 });
  tick.connect(tbp).connect(tg).connect(dest);
  percussive(tg.gain, t, 0.22 * vel, 0.0005, 0.01);
  release(tick, [tbp, tg]);
}

/** The hi-hat played with the foot: two cymbals closing, a soft "chk" with a little sizzle and no ring. */
function chick(kit: Kit, dest: AudioNode, t: number, vel: number, o: HitOpts) {
  const { ctx } = kit;
  const tone = o.tone ?? 1;
  const n = noiseSource(kit, t, 0.08);
  const body = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 2400 * tone, Q: 1.3 });
  const bg = new GainNode(ctx, { gain: 0 });
  n.connect(body).connect(bg).connect(dest);
  percussive(bg.gain, t, 1.1 * vel, 0.003, 0.035);
  const sizzle = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 7000 * tone, Q: 0.5 });
  const sg = new GainNode(ctx, { gain: 0 });
  n.connect(sizzle).connect(sg).connect(dest);
  percussive(sg.gain, t, 0.3 * vel, 0.002, 0.05);
  release(n, [body, bg, sizzle, sg]);
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
    case 'jazzride':
      return jazzRide(kit, dest, t, vel, o);
    case 'chick':
      return chick(kit, dest, t, vel, o);
  }
}
