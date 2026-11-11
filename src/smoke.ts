// Dev-only audio smoke test (open smoke.html, or run `npm run smoke`).
// Renders each tile through the real engine in an OfflineAudioContext and
// reports loudness, peaks, clipping and invalid samples.
import { Engine } from './engine/engine';
import { TILES, type TileId } from './tiles';

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

/** Gated integrated loudness: 400 ms blocks with 75% overlap, an absolute gate at -70, then a relative one 10 LU down. */
function integratedLufs(buf: AudioBuffer, from: number, to: number): number {
  const fs = buf.sampleRate;
  const filters = kWeighting(fs);
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
  const loudness = (e: number) => (e <= 0 ? -Infinity : -0.691 + 10 * Math.log10(e));
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const absolute = energies.filter((e) => loudness(e) > -70);
  if (!absolute.length) return -180;
  const gate = loudness(mean(absolute)) - 10;
  const kept = absolute.filter((e) => loudness(e) > gate);
  return Math.round(loudness(mean(kept)) * 10) / 10;
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
}

async function render(s: Scenario): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, SR * s.seconds, SR);
  const engine = new Engine(ctx);
  // Tiles on physical models only play once those have loaded.
  await engine.ready;
  engine.setBpm(s.bpm ?? 80);
  engine.setKey(9);
  engine.setEvolution(s.evolution ?? 0.5);
  for (const [id, v] of Object.entries(s.tiles)) engine.setTile(id as TileId, true, v);
  engine.renderUntil(s.seconds);
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

export async function runSmoke(opts: { wavs?: boolean } = {}) {
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
  }
}
window.runSmoke = runSmoke;
