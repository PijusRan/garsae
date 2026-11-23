// Dev-only audio smoke test (open smoke.html, or run `npm run smoke`).
// Renders each tile through the real engine in an OfflineAudioContext and
// reports loudness, peaks, clipping and invalid samples.
import { ALTERNATES, ALTERNATE_TILES, prepareAlternates, slotLabels } from './engine/alternates';
import { Engine } from './engine/engine';
import { TILES, type Category, type TileId } from './tiles';

const SR = 44100;

interface Stats {
  name: string;
  rmsDb: number;
  peak: number;
  clipped: number;
  nans: number;
  /** Loudest and quietest 400 ms window after the fade-in, in dB. */
  windowMaxDb: number;
  windowMinDb: number;
  /** Largest jump in loudness between neighbouring windows, in dB. */
  maxJumpDb: number;
  /** Integrated loudness (ITU-R BS.1770, gated). What ears hear, unlike RMS. */
  lufs: number;
  /** Peak between samples too, from 4x oversampling. */
  truePeakDb: number;
}

const db = (x: number) => (x <= 1e-9 ? -180 : 20 * Math.log10(x));

interface Biquad {
  b: [number, number, number];
  a: [number, number];
}

/** ITU-R BS.1770 K-weighting at any rate, in the libebur128 form, which reproduces the standard's 48 kHz coefficients. */
function kWeighting(fs: number): Biquad[] {
  const shelf = (() => {
    const Q = 0.7071752369554196;
    const K = Math.tan((Math.PI * 1681.974450955533) / fs);
    const Vh = 10 ** (3.999843853973347 / 20);
    const Vb = Vh ** 0.4996667741545416;
    const a0 = 1 + K / Q + K * K;
    return {
      b: [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0],
      a: [(2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0],
    } as Biquad;
  })();
  const highpass = (() => {
    const Q = 0.5003270373238773;
    const K = Math.tan((Math.PI * 38.13547087602444) / fs);
    const a0 = 1 + K / Q + K * K;
    return { b: [1, -2, 1], a: [(2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0] } as Biquad;
  })();
  return [shelf, highpass];
}

function filtered(x: Float32Array, filters: Biquad[]): Float64Array {
  const out = Float64Array.from(x);
  for (const { b, a } of filters) {
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < out.length; i++) {
      const x0 = out[i];
      const y0 = b[0] * x0 + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2;
      x2 = x1;
      x1 = x0;
      y2 = y1;
      y1 = y0;
      out[i] = y0;
    }
  }
  return out;
}

/**
 * IEC 61672 A-weighting as three biquads (bilinear transform), 0 dB at 1 kHz. It follows the ear at quiet listening
 * levels, where deep bass counts for far less than K-weighting gives it. Accurate below about 5 kHz, which is where
 * it is used here: to tell how much of a tile's loudness is deep bass.
 */
function aWeighting(fs: number): Biquad[] {
  const [w1, w2, w3, w4] = [20.598997, 107.65265, 737.86223, 12194.217].map((f) => 2 * Math.PI * f);
  const K = 2 * fs;
  // Each section's s-domain numerator and denominator, highest power first.
  const sections = [
    [[1, 0, 0], [1, 2 * w1, w1 * w1]],
    [[1, 0, 0], [1, w2 + w3, w2 * w3]],
    [[0, 0, w4 * w4], [1, 2 * w4, w4 * w4]],
  ].map(([n, d]) => {
    const a0 = d[0] * K * K + d[1] * K + d[2];
    return {
      b: [(n[0] * K * K + n[1] * K + n[2]) / a0, (2 * n[2] - 2 * n[0] * K * K) / a0, (n[0] * K * K - n[1] * K + n[2]) / a0],
      a: [(2 * d[2] - 2 * d[0] * K * K) / a0, (d[0] * K * K - d[1] * K + d[2]) / a0],
    } as Biquad;
  });
  // Gain at 1 kHz, from each section's response at z = e^jw.
  const w = (2 * Math.PI * 1000) / fs;
  let gain = 1;
  for (const { b, a } of sections) {
    const mag = (c0: number, c1: number, c2: number) =>
      Math.hypot(c0 + c1 * Math.cos(w) + c2 * Math.cos(2 * w), c1 * Math.sin(w) + c2 * Math.sin(2 * w));
    gain *= mag(b[0], b[1], b[2]) / mag(1, a[0], a[1]);
  }
  sections[0].b = sections[0].b.map((v) => v / gain) as Biquad['b'];
  return sections;
}

/** Mean square of 400 ms blocks with 75% overlap, summed over both channels: the blocks BS.1770 gates on. */
function blockEnergies(buf: AudioBuffer, filters: Biquad[], from: number, to: number): number[] {
  const fs = buf.sampleRate;
  const channels = [0, 1].map((c) => filtered(buf.getChannelData(c), filters));
  const block = Math.round(0.4 * fs);
  const hop = Math.round(0.1 * fs);
  const energies: number[] = [];
  for (let s = Math.floor(from * fs); s + block <= Math.floor(to * fs); s += hop) {
    let sum = 0;
    for (const ch of channels) {
      let e = 0;
      for (let i = s; i < s + block; i++) e += ch[i] * ch[i];
      sum += e / block;
    }
    energies.push(sum);
  }
  return energies;
}

const K_OFFSET = -0.691;
const blockDb = (e: number, offset: number) => (e <= 0 ? -Infinity : offset + 10 * Math.log10(e));
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

/** The blocks left by BS.1770's gates: an absolute one at -70, then a relative one 10 LU under what passed it. */
function gated(energies: number[], offset: number): number[] {
  const absolute = energies.filter((e) => blockDb(e, offset) > -70);
  if (!absolute.length) return [];
  const gate = blockDb(mean(absolute), offset) - 10;
  return absolute.filter((e) => blockDb(e, offset) > gate);
}

/** Gated integrated loudness (ITU-R BS.1770). */
function integratedLufs(buf: AudioBuffer, from: number, to: number): number {
  const kept = gated(blockEnergies(buf, kWeighting(buf.sampleRate), from, to), K_OFFSET);
  return kept.length ? Math.round(blockDb(mean(kept), K_OFFSET) * 10) / 10 : -180;
}

interface Reading {
  /** Gated integrated loudness. */
  integrated: number;
  /** Its loud moments: the 90th percentile of the gated blocks. Struck and sparse sounds sit well above their average. */
  loud: number;
}

function reading(buf: AudioBuffer, filters: Biquad[], offset: number, from: number, to: number): Reading {
  const kept = gated(blockEnergies(buf, filters, from, to), offset);
  if (!kept.length) return { integrated: -180, loud: -180 };
  const sorted = kept.map((e) => blockDb(e, offset)).sort((a, b) => a - b);
  return { integrated: blockDb(mean(kept), offset), loud: sorted[Math.round(0.9 * (sorted.length - 1))] };
}

/** 4x oversampled peak: a windowed-sinc interpolation, run only around the loudest samples. */
function truePeak(buf: AudioBuffer, from: number, to: number): number {
  const TAPS = 16;
  const phases = [0.25, 0.5, 0.75].map((frac) => {
    const h: number[] = [];
    for (let k = -TAPS + 1; k <= TAPS; k++) {
      const x = k - frac;
      const hann = 0.5 + 0.5 * Math.cos((Math.PI * x) / TAPS);
      h.push((x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)) * hann);
    }
    return h;
  });
  let peak = 0;
  for (const c of [0, 1]) {
    const x = buf.getChannelData(c);
    const start = Math.max(TAPS, Math.floor(from * buf.sampleRate));
    const end = Math.min(x.length - TAPS - 1, Math.floor(to * buf.sampleRate));
    let raw = 0;
    for (let i = start; i < end; i++) raw = Math.max(raw, Math.abs(x[i]));
    for (let i = start; i < end; i++) {
      const v = Math.abs(x[i]);
      if (v > peak) peak = v;
      if (v < raw * 0.6) continue;
      for (const h of phases) {
        let y = 0;
        for (let k = 0; k < h.length; k++) y += h[k] * x[i + k - TAPS + 1];
        if (Math.abs(y) > peak) peak = Math.abs(y);
      }
    }
  }
  return Math.round(db(peak) * 10) / 10;
}

function analyse(name: string, buf: AudioBuffer, from: number, to = buf.duration): Stats {
  const a = buf.getChannelData(0);
  const b = buf.getChannelData(1);
  let sq = 0;
  let peak = 0;
  let clipped = 0;
  let nans = 0;
  const start = Math.floor(from * SR);
  const end = Math.floor(to * SR);
  const win = Math.floor(0.4 * SR);
  const windows: number[] = [];
  let wsq = 0;
  for (let i = start; i < end; i++) {
    const l = a[i];
    const r = b[i];
    if (!Number.isFinite(l) || !Number.isFinite(r)) {
      nans++;
      continue;
    }
    const m = Math.max(Math.abs(l), Math.abs(r));
    if (m > peak) peak = m;
    if (m >= 0.999) clipped++;
    const s = (l * l + r * r) / 2;
    sq += s;
    wsq += s;
    if ((i - start + 1) % win === 0) {
      windows.push(Math.sqrt(wsq / win));
      wsq = 0;
    }
  }
  let maxJump = 0;
  for (let i = 1; i < windows.length; i++) maxJump = Math.max(maxJump, Math.abs(db(windows[i]) - db(windows[i - 1])));
  return {
    name,
    rmsDb: Math.round(db(Math.sqrt(sq / (end - start))) * 10) / 10,
    peak: Math.round(peak * 1000) / 1000,
    clipped,
    nans,
    windowMaxDb: Math.round(db(Math.max(...windows)) * 10) / 10,
    windowMinDb: Math.round(db(Math.min(...windows)) * 10) / 10,
    maxJumpDb: Math.round(maxJump * 10) / 10,
    lufs: integratedLufs(buf, from, to),
    truePeakDb: truePeak(buf, from, to),
  };
}

/** The standard's reference: a 997 Hz sine at 0 dBFS in one channel must read -3.01 LUFS. */
async function meterReference(): Promise<number> {
  const ctx = new OfflineAudioContext(2, SR * 4, SR);
  const merger = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
  const tone = new OscillatorNode(ctx, { frequency: 997 });
  tone.connect(merger, 0, 0);
  merger.connect(ctx.destination);
  tone.start();
  return integratedLufs(await ctx.startRendering(), 0.5, 4);
}

interface Scenario {
  tiles: Partial<Record<TileId, number>>;
  seconds: number;
  evolution?: number;
  bpm?: number;
  /** Turn these tiles off at this time (tests fade-out). */
  offAt?: { time: number; ids: TileId[] };
  /** Play the tiles' k-th alternate (src/engine/alternates) instead of their own voice. */
  alternate?: number;
  key?: number;
  /** Makes the take repeatable: the same notes on every run, over a fixed chord loop (i, bVII, bIII, IV). */
  seed?: number;
}

/** A small seeded generator (mulberry32) to stand in for Math.random while a repeatable take is scheduled. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function render(s: Scenario): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.round(SR * s.seconds), SR);
  const random = Math.random;
  if (s.seed !== undefined) Math.random = seededRandom(s.seed);
  try {
    const engine = new Engine(ctx, s.alternate ? { alternates: ALTERNATES } : {});
    // Tiles on physical models only play once those have loaded.
    await engine.ready;
    if (s.alternate) {
      await prepareAlternates(ctx);
      engine.setCompareChoice(s.alternate);
    }
    if (s.seed !== undefined) engine.chords.loop = [0, 6, 2, 3].map((degree) => ({ degree, bars: 2 }));
    engine.setBpm(s.bpm ?? 80);
    engine.setKey(s.key ?? 9);
    engine.setEvolution(s.evolution ?? 0.5);
    for (const [id, v] of Object.entries(s.tiles)) engine.setTile(id as TileId, true, v);
    // Every note of the take is scheduled here, so the seed can go straight after.
    engine.renderUntil(s.seconds);
  } finally {
    Math.random = random;
  }
  return ctx.startRendering();
}

async function renderWithSwitchOff(s: Scenario & { offAt: { time: number; ids: TileId[] } }): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, SR * s.seconds, SR);
  const engine = new Engine(ctx);
  await engine.ready;
  engine.setBpm(s.bpm ?? 80);
  engine.setKey(9);
  engine.setEvolution(s.evolution ?? 0.5);
  for (const [id, v] of Object.entries(s.tiles)) engine.setTile(id as TileId, true, v);
  engine.renderUntil(s.offAt.time + 0.8);
  ctx.suspend(s.offAt.time).then(() => {
    for (const id of s.offAt.ids) engine.setTile(id, false);
    engine.renderUntil(s.seconds);
    void ctx.resume();
  });
  return ctx.startRendering();
}

function toWav(buf: AudioBuffer): string {
  const n = buf.length;
  const out = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  out.setUint32(4, 36 + n * 4, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, 2, true);
  out.setUint32(24, SR, true);
  out.setUint32(28, SR * 4, true);
  out.setUint16(32, 4, true);
  out.setUint16(34, 16, true);
  str(36, 'data');
  out.setUint32(40, n * 4, true);
  const l = buf.getChannelData(0);
  const r = buf.getChannelData(1);
  for (let i = 0; i < n; i++) {
    out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, l[i])) * 0x7fff, true);
    out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, r[i])) * 0x7fff, true);
  }
  const bytes = new Uint8Array(out.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * Each tile with an alternate voice, rendered with its own voice and with the alternate: loudness side by side, and
 * what to multiply the alternate's trim by (alternates/index.ts) so A/B comparisons are at equal loudness. Played at
 * a low volume so the master limiter stays out of it, and long, since the notes are random.
 */
async function runCompare(wavs: Record<string, string> | null) {
  const rows: (Stats & { ownLufs: number; trimBy: number })[] = [];
  for (const id of ALTERNATE_TILES) {
    const s = { tiles: { [id]: 0.3 }, seconds: 40, evolution: 0.6 };
    const own = analyse(id, await render(s), 5);
    const labels = slotLabels(id);
    for (let k = 1; k < labels.length; k++) {
      const buf = await render({ ...s, alternate: k });
      const alt = analyse(`${id}: ${labels[k]}`, buf, 5);
      if (wavs) wavs[`${id} ${labels[k]}`] = toWav(buf);
      rows.push({ ...alt, ownLufs: own.lufs, trimBy: Math.round(10 ** ((own.lufs - alt.lufs) / 20) * 1000) / 1000 });
    }
  }
  return rows;
}

/**
 * What tile levels are set against. Tiles should sound about equally loud at the same slider position, and LUFS alone
 * does not say that: it counts a kick's or a sub's deep bass in full, which the ear at these listening levels and most
 * speakers do not, and it averages a struck note's attack away. So each tile gets a balance figure: the mean of its
 * integrated loudness and its loud moments, moved by up to 2 LU for how much of it is deep bass (the gap between its
 * K- and A-weighted readings, against the gap usual in its category): down when it is carried by its mids, up when it
 * is nearly all low end. Bass and drums aim 2 LU higher than pads, the low end LUFS counts but the ear hears less of.
 * Textures are a bed under the music: 3 LU under pads, and steady, so nothing in them stands out to carry them.
 */
const BALANCE: Record<Exclude<Category, 'effects'>, { target: number; usualGap: number }> = {
  pads: { target: -23, usualGap: 4 },
  bass: { target: -21, usualGap: 13 },
  drums: { target: -21, usualGap: 10 },
  texture: { target: -26, usualGap: 4 },
};
/** Tiles kept softer than their category on purpose, in LU. */
const SOFTER: Partial<Record<TileId, number>> = { arp: -3, drone: -3, flute: -6, crackle: -3 };
/** A tile alone at slider 0.5 peaks no higher than this (dBTP), so the limiter is left for mixes. */
const PEAK_CEILING = -2;
/** The slider position levels are balanced at. */
const REFERENCE_VOLUME = 0.5;

const db1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Each tile alone at its default volume, over repeatable takes (three keys, or for drums three tempos):
 * its loudness, its balance figure at slider 0.5 against its target, and what to multiply its `level` by to meet it.
 */
async function runDefaults(only: string[]) {
  const rows = [];
  for (const t of TILES) {
    if (t.effect || (only.length && !only.includes(t.id))) continue;
    const takes =
      t.category === 'drums' ? [60, 75, 90].map((bpm) => ({ bpm, key: 9 })) : [9, 1, 5].map((key) => ({ bpm: 75, key }));
    const k: Reading[] = [];
    const a: Reading[] = [];
    let peak = -180;
    let nans = 0;
    let clipped = 0;
    for (const [i, take] of takes.entries()) {
      // Two bars to settle, then twelve measured.
      const bar = 240 / take.bpm;
      const from = 0.1 + 2 * bar;
      const to = 0.1 + 14 * bar;
      const buf = await render({ tiles: { [t.id]: t.defaultVolume }, seconds: to + 0.3, evolution: 0.3, seed: 7919 * (i + 1), ...take });
      // A sparse tile (the bells) can stay silent through a whole take, which says nothing about its level.
      const kr = reading(buf, kWeighting(SR), K_OFFSET, from, to);
      if (kr.integrated > -180) {
        k.push(kr);
        a.push(reading(buf, aWeighting(SR), 0, from, to));
      }
      const st = analyse(t.id, buf, from, to);
      peak = Math.max(peak, st.truePeakDb);
      nans += st.nans;
      clipped += st.clipped;
    }
    const lufs = mean(k.map((r) => r.integrated));
    const loud = mean(k.map((r) => r.loud));
    const figure = (lufs + loud) / 2;
    const aFigure = mean(a.map((r) => (r.integrated + r.loud) / 2));
    const atReference = 40 * Math.log10(REFERENCE_VOLUME / t.defaultVolume);
    const aim = BALANCE[t.category as keyof typeof BALANCE];
    const tilt = Math.min(2, Math.max(-2, 0.5 * (figure - aFigure - aim.usualGap)));
    const balance = figure - tilt + atReference;
    const target = aim.target + (SOFTER[t.id] ?? 0);
    // Up to the target, unless its peaks reach the ceiling first.
    const gain = Math.min(target - balance, PEAK_CEILING - (peak + atReference));
    rows.push({
      name: t.id,
      vol: t.defaultVolume,
      lufs: db1(lufs),
      loud: db1(loud),
      aWeighted: db1(aFigure),
      truePeakDb: db1(peak),
      balance: db1(balance),
      target,
      levelBy: Math.round(10 ** (gain / 20) * 1000) / 1000,
      peakLimited: gain < target - balance - 0.05,
      nans,
      clipped,
    });
  }
  return rows;
}

export async function runSmoke(opts: { wavs?: boolean; compare?: boolean; defaults?: boolean; tiles?: string[] } = {}) {
  if (opts.defaults) {
    return { solo: [], scenes: [], defaults: await runDefaults(opts.tiles ?? []), wavs: {}, reference: await meterReference() };
  }
  if (opts.compare) {
    const wavs: Record<string, string> = {};
    return { solo: [], scenes: [], compare: await runCompare(opts.wavs ? wavs : null), wavs, reference: await meterReference() };
  }
  const solo: Stats[] = [];
  for (const t of TILES) {
    if (t.effect) continue;
    const buf = await render({ tiles: { [t.id]: 1 }, seconds: 16 });
    solo.push(analyse(t.id, buf, 5));
  }

  const scenes: Stats[] = [];
  const wavs: Record<string, string> = {};
  const add = async (name: string, s: Scenario, from = 5) => {
    const buf = await render(s);
    scenes.push(analyse(name, buf, from));
    if (opts.wavs) wavs[name] = toWav(buf);
  };
  await add('default mix', { tiles: { pad: 0.65, lofi: 0.45, brown: 0.3 }, seconds: 60 });
  await add('evolving mix', {
    tiles: { pad: 0.6, bells: 0.5, sub: 0.5, dub: 0.5, crackle: 0.35, arp: 0.4 },
    seconds: 60,
    evolution: 0.9,
    bpm: 72,
  });
  await add('everything at full volume', {
    tiles: Object.fromEntries(TILES.map((t) => [t.id, 1])) as Partial<Record<TileId, number>>,
    seconds: 20,
    evolution: 1,
    bpm: 130,
  });
  await add('breakbeat evolution 1', { tiles: { breaks: 0.3, pad: 0.6 }, seconds: 30, evolution: 1, bpm: 88 });
  await add('am + wobble on pad', { tiles: { pad: 0.7, am: 0.6, wobble: 0.6 }, seconds: 16 });
  await add('pad alone, for the effects', { tiles: { pad: 0.7 }, seconds: 16 });
  await add('width + orbit + hall on pad', { tiles: { pad: 0.7, width: 0.8, orbit: 0.8, hall: 0.8 }, seconds: 16 });

  // Fade-out: turn every sound off at 8 s; the tail after 14 s should be silent apart from the reverb.
  const fade = await renderWithSwitchOff({
    tiles: { pad: 0.7, lofi: 0.5, brown: 0.4, drone: 0.5, crackle: 0.4 },
    seconds: 18,
    offAt: { time: 8, ids: ['pad', 'lofi', 'brown', 'drone', 'crackle'] },
  });
  scenes.push(analyse('before switch-off (4-8 s)', fade, 4, 8));
  scenes.push(analyse('after switch-off (14-18 s)', fade, 14, 18));

  return { solo, scenes, wavs, reference: await meterReference() };
}

declare global {
  interface Window {
    runSmoke: typeof runSmoke;
    /** The sound tiles, in catalogue order. */
    smokeTiles: string[];
  }
}
window.runSmoke = runSmoke;
window.smokeTiles = TILES.filter((t) => !t.effect).map((t) => t.id);
