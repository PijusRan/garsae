// Mix state: what the user chose. Saved mixes and share links store settings only,
// never a random seed, so the music is different on every play.
import { TILES, TILE_BY_ID, TILE_IDS, isTileId, type TileId } from '../tiles';
import type { PresetId } from './presets';

export interface TileSetting {
  on: boolean;
  volume: number;
  /** This tile's own Evolution, 0-1, or null to follow the mix's. */
  evolution: number | null;
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

export function allTiles(on: Partial<Record<TileId, number>> = {}): Record<TileId, TileSetting> {
  const out = {} as Record<TileId, TileSetting>;
  for (const t of TILES) {
    const v = on[t.id];
    out[t.id] = { on: v !== undefined, volume: v ?? t.defaultVolume, evolution: null };
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

/**
 * Encodes a mix as a compact hash string, e.g. "t=pad.65.40,lofi.45,-bells.20&e=30&b=72&k=9".
 * - marks an off tile with custom settings; a third number is the tile's own Evolution.
 */
export function encodeMix(m: MixState): string {
  const parts: string[] = [];
  for (const id of TILE_IDS) {
    const s = m.tiles[id];
    const own = s.evolution === null ? '' : `.${Math.round(s.evolution * 100)}`;
    const entry = `${id}.${Math.round(s.volume * 100)}${own}`;
    if (s.on) parts.push(entry);
    else if (own || Math.abs(s.volume - TILE_BY_ID[id].defaultVolume) > 0.005) parts.push(`-${entry}`);
  }
  const q = new URLSearchParams();
  q.set('t', parts.join(','));
  q.set('e', String(Math.round(m.evolution * 100)));
  if (m.bpm !== null) q.set('b', String(m.bpm));
  if (m.key !== null) q.set('k', String(m.key));
  // Keep commas readable in the URL.
  return q.toString().replace(/%2C/g, ',');
}

const RENAMED: Record<string, TileId> = { brushes: 'hands', house: 'techno' };

/** Parses a share string. Unknown or broken parts are ignored; returns null if nothing usable. */
export function decodeMix(input: string): MixState | null {
  const q = new URLSearchParams(input.replace(/^#/, ''));
  const t = q.get('t');
  if (t === null) return null;
  const mix: MixState = { tiles: allTiles(), evolution: 0.3, bpm: null, key: null };
  for (const raw of t.split(',')) {
    if (!raw) continue;
    const off = raw.startsWith('-');
    const [name, vol, evo] = (off ? raw.slice(1) : raw).split('.');
    // Tiles that were replaced: old links and saved mixes get the tile that took their place.
    const id = RENAMED[name] ?? name;
    if (!isTileId(id)) continue;
    const v = Number(vol);
    const ev = evo === undefined || evo === '' ? NaN : Number(evo);
    mix.tiles[id] = {
      on: !off,
      volume: Number.isFinite(v) ? clamp01(v / 100) : TILE_BY_ID[id].defaultVolume,
      evolution: Number.isFinite(ev) ? clamp01(ev / 100) : null,
    };
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
const HIDDEN_STARTERS_KEY = 'garsae.hiddenStarters';

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
/** `tileName` and `untitled` come from the current language. */
export function suggestName(mix: MixState, tileName: (id: TileId) => string, untitled: string): string {
  const on = TILES.filter((t) => mix.tiles[t.id].on).sort((a, b) => mix.tiles[b.id].volume - mix.tiles[a.id].volume);
  if (on.length === 0) return untitled;
  return on
    .slice(0, 2)
    .map((t) => tileName(t.id))
    .join(' + ');
}

/** Puts a previous list back, for undoing a delete or an overwrite. */
export function restoreMixes(list: SavedMix[]): SavedMix[] {
  write(MIXES_KEY, list);
  return list;
}

/** Starter mixes the user deleted. They stay hidden in this browser until brought back. */
export const loadHiddenStarters = (): PresetId[] => read<PresetId[]>(HIDDEN_STARTERS_KEY, []);

export function setHiddenStarters(ids: PresetId[]): PresetId[] {
  write(HIDDEN_STARTERS_KEY, ids);
  return ids;
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
