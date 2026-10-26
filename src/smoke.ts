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
}

const db = (x: number) => (x <= 1e-9 ? -180 : 20 * Math.log10(x));

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
  };
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
    tiles: { pad: 0.6, bells: 0.5, sub: 0.5, dub: 0.5, crackle: 0.35, grains: 0.4 },
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

  return { solo, scenes, wavs };
}

declare global {
  interface Window {
    runSmoke: typeof runSmoke;
  }
}
window.runSmoke = runSmoke;
