// Mix state: what the user chose. Saved mixes and share links store settings only,
// never a random seed, so the music is different on every play.
import { TILES, TILE_BY_ID, TILE_IDS, isTileId, type TileId } from '../tiles';

export interface TileSetting {
  on: boolean;
  volume: number;
}

export interface MixState {
  tiles: Record<TileId, TileSetting>;
  /** 0 = static, 1 = constantly shifting. */
  evolution: number;
  /** null = left random (rolled 60-90 on start). Only stored when the user set it. */
  bpm: number | null;
  /** Root pitch class 0-11, or null = random. */
  key: number | null;
}

export const BPM_MIN = 60;
export const BPM_MAX = 130;
export const RANDOM_BPM_MIN = 60;
export const RANDOM_BPM_MAX = 90;

const randInt = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const round2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const rollBpm = (): number => randInt(RANDOM_BPM_MIN, RANDOM_BPM_MAX);
export const rollKey = (): number => randInt(0, 11);

function allTiles(on: Partial<Record<TileId, number>> = {}): Record<TileId, TileSetting> {
  const out = {} as Record<TileId, TileSetting>;
  for (const t of TILES) {
    const v = on[t.id];
    out[t.id] = { on: v !== undefined, volume: v ?? t.defaultVolume };
  }
  return out;
}

/** The first milestone mix: one pad, drums and a noise bed. */
export function defaultMix(): MixState {
  return {
    tiles: allTiles({ pad: 0.65, lofi: 0.45, brown: 0.3 }),
    evolution: 0.3,
    bpm: null,
    key: null,
  };
}

// ---------------------------------------------------------------- share links

/** Encodes a mix as a compact hash string, e.g. "t=pad.65,lofi.45,-bells.20&e=30&b=72&k=9" (- marks an off tile with a custom volume). */
export function encodeMix(m: MixState): string {
  const parts: string[] = [];
  for (const id of TILE_IDS) {
    const s = m.tiles[id];
    const vol = Math.round(s.volume * 100);
    if (s.on) parts.push(`${id}.${vol}`);
    else if (Math.abs(s.volume - TILE_BY_ID[id].defaultVolume) > 0.005) parts.push(`-${id}.${vol}`);
  }
  const q = new URLSearchParams();
  q.set('t', parts.join(','));
  q.set('e', String(Math.round(m.evolution * 100)));
  if (m.bpm !== null) q.set('b', String(m.bpm));
  if (m.key !== null) q.set('k', String(m.key));
  // Keep commas readable in the URL.
  return q.toString().replace(/%2C/g, ',');
}

/** Parses a share string. Unknown or broken parts are ignored; returns null if nothing usable. */
export function decodeMix(input: string): MixState | null {
  const q = new URLSearchParams(input.replace(/^#/, ''));
  const t = q.get('t');
  if (t === null) return null;
  const mix: MixState = { tiles: allTiles(), evolution: 0.3, bpm: null, key: null };
  for (const raw of t.split(',')) {
    if (!raw) continue;
    const off = raw.startsWith('-');
    const [id, vol] = (off ? raw.slice(1) : raw).split('.');
    if (!isTileId(id)) continue;
    const v = Number(vol);
    mix.tiles[id] = { on: !off, volume: Number.isFinite(v) ? clamp01(v / 100) : TILE_BY_ID[id].defaultVolume };
  }
  const e = Number(q.get('e'));
  if (q.has('e') && Number.isFinite(e)) mix.evolution = clamp01(e / 100);
  const b = Number(q.get('b'));
  if (q.has('b') && Number.isFinite(b)) mix.bpm = Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(b)));
  const k = Number(q.get('k'));
  if (q.has('k') && Number.isInteger(k) && k >= 0 && k <= 11) mix.key = k;
  return mix;
}

// ---------------------------------------------------------------- local storage

export interface SavedMix {
  id: string;
  name: string;
  savedAt: number;
  /** Stored in the same compact format as share links. */
  mix: string;
}

const MIXES_KEY = 'garsae.mixes';
const LAST_KEY = 'garsae.last';
const VOLUME_KEY = 'garsae.volume';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be full or blocked (private mode). Saving is best effort.
  }
}

export const loadSavedMixes = (): SavedMix[] => read<SavedMix[]>(MIXES_KEY, []);

export function saveMix(name: string, mix: MixState): SavedMix[] {
  const list = loadSavedMixes();
  const entry: SavedMix = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || 'Untitled mix',
    savedAt: Date.now(),
    mix: encodeMix(mix),
  };
  const next = [entry, ...list];
  write(MIXES_KEY, next);
  return next;
}

export function deleteMix(id: string): SavedMix[] {
  const next = loadSavedMixes().filter((m) => m.id !== id);
  write(MIXES_KEY, next);
  return next;
}

export function renameMix(id: string, name: string): SavedMix[] {
  const next = loadSavedMixes().map((m) => (m.id === id ? { ...m, name: name.trim() || m.name } : m));
  write(MIXES_KEY, next);
  return next;
}

/** Overwrites a saved mix with the current settings, keeping its name. */
export function updateMix(id: string, mix: MixState): SavedMix[] {
  const next = loadSavedMixes().map((m) => (m.id === id ? { ...m, mix: encodeMix(mix), savedAt: Date.now() } : m));
  write(MIXES_KEY, next);
  return next;
}

/** A default name from the loudest two tiles, e.g. "Warm pad + Lo-fi hip hop". */
export function suggestName(mix: MixState): string {
  const on = TILES.filter((t) => mix.tiles[t.id].on).sort((a, b) => mix.tiles[b.id].volume - mix.tiles[a.id].volume);
  if (on.length === 0) return 'Untitled mix';
  return on
    .slice(0, 2)
    .map((t) => t.name)
    .join(' + ');
}

/** Puts a previous list back, for undoing a delete or an overwrite. */
export function restoreMixes(list: SavedMix[]): SavedMix[] {
  write(MIXES_KEY, list);
  return list;
}

export const loadVolume = (): number => {
  const v = read<number>(VOLUME_KEY, 0.8);
  return typeof v === 'number' && Number.isFinite(v) ? clamp01(v) : 0.8;
};
export const saveVolume = (v: number): void => write(VOLUME_KEY, round2(v));

export const rememberLast = (mix: MixState): void => write(LAST_KEY, encodeMix(mix));

export function loadLast(): MixState | null {
  const s = read<string | null>(LAST_KEY, null);
  return s ? decodeMix(s) : null;
}

// ---------------------------------------------------------------- surprise me

const between = (lo: number, hi: number) => round2(lo + Math.random() * (hi - lo));
const pickOne = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

/**
 * A random but balanced, calm mix. Guardrails:
 * - always one harmonic bed (warm pad or drone), at most 6 tiles in total
 * - at most one extra melodic layer and at most one bass
 * - at most one drum genre; busy genres (breakbeat, techno) are rarer and kept quiet
 * - at most one atmosphere and at most one noise colour, both low in the mix
 * - effect tiles (AM, wobble) and beat tones (binaural, isochronic) are never picked
 * - Evolution stays in the calm 0.15-0.5 range; BPM and key stay random (60-90)
 */
export function surpriseMix(): MixState {
  const on: Partial<Record<TileId, number>> = {};
  const bed = pickOne<TileId>(['pad', 'pad', 'drone']);
  on[bed] = between(0.5, 0.75);
  if (bed === 'drone' || Math.random() < 0.6) {
    const melodic = pickOne<TileId>(['bells', 'arp', 'grains', bed === 'drone' ? 'pad' : 'bells']);
    on[melodic] = melodic === 'pad' ? between(0.45, 0.6) : between(0.3, 0.55);
  }
  if (Math.random() < 0.55) on[pickOne<TileId>(['sub', 'walk', 'pulse'])] = between(0.35, 0.55);
  if (Math.random() < 0.75) {
    const drum = pickOne<TileId>(['lofi', 'lofi', 'dub', 'ambient', 'ambient', 'techno', 'breaks']);
    on[drum] = drum === 'breaks' ? between(0.3, 0.42) : drum === 'techno' ? between(0.3, 0.42) : between(0.35, 0.55);
  }
  if (Math.random() < 0.5) on[pickOne<TileId>(['crackle', 'wind', 'hum'])] = between(0.2, 0.4);
  if (Math.random() < 0.35) on[pickOne<TileId>(['brown', 'pink', 'green'])] = between(0.15, 0.3);

  // Enforce the size cap by dropping the least essential layers first.
  const order: TileId[] = ['brown', 'pink', 'green', 'crackle', 'wind', 'hum', 'grains'];
  let count = Object.keys(on).length;
  for (const id of order) {
    if (count <= 6) break;
    if (on[id] !== undefined) {
      delete on[id];
      count--;
    }
  }
  return { tiles: allTiles(on), evolution: between(0.15, 0.5), bpm: null, key: null };
}
