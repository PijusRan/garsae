// Pure pattern data and mutation rules. No audio here, so it is easy to test.
import { chance, clamp, pick, rand, weightedPick } from '../random';
import type { HitOpts, Voice } from './voices';

/** X = accent, x = normal, o = soft, g = ghost, . = rest. */
const VEL: Record<string, number> = { X: 1, x: 0.8, o: 0.5, g: 0.26, '.': 0 };

export function parsePattern(p: string): number[] {
  return [...p.replace(/\s/g, '')].map((c) => VEL[c] ?? 0);
}

export interface TrackDef {
  voice: Voice;
  pattern: string;
  /** Core hits (kick, main snare) never mutate in pattern genres. */
  core?: boolean;
  gain?: number;
  opts?: HitOpts;
  /** Sent to the genre's echo, if it has one. */
  echo?: boolean;
}

export interface Track {
  def: TrackDef;
  base: number[];
  cur: number[];
}

export const makeTracks = (defs: TrackDef[]): Track[] =>
  defs.map((def) => {
    const base = parsePattern(def.pattern);
    return { def, base, cur: [...base] };
  });

export type MutationKind = 'addGhost' | 'removeGhost' | 'shift' | 'accent' | 'revert';

/** How far the soft tracks have drifted from their base patterns (number of differing steps). */
export function drift(tracks: Track[]): number {
  let d = 0;
  for (const t of tracks) for (let i = 0; i < t.cur.length; i++) if (Math.abs(t.cur[i] - t.base[i]) > 0.05) d++;
  return d;
}

/**
 * One small edit to the soft (non-core) tracks: add/remove a ghost hit,
 * shift a hit by one step, change an accent, or drift back toward the base.
 * Core hits (kick, main snare) are never touched.
 */
export function mutateOnce(tracks: Track[]): MutationKind | null {
  const soft = tracks.filter((t) => !t.def.core);
  if (soft.length === 0) return null;
  const d = drift(soft);
  const kind = weightedPick<MutationKind>(
    ['addGhost', 'removeGhost', 'shift', 'accent', 'revert'],
    [3, 2, 2, 3, 0.5 + d / 3],
  );
  const track = pick(soft);
  const steps = track.cur;
  const hits = steps.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
  const empty = steps.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);

  switch (kind) {
    case 'addGhost': {
      if (!empty.length) return null;
      steps[pick(empty)] = rand(0.18, 0.34);
      return kind;
    }
    case 'removeGhost': {
      const ghosts = hits.filter((i) => steps[i] < 0.45);
      if (!ghosts.length) return null;
      steps[pick(ghosts)] = 0;
      return kind;
    }
    case 'shift': {
      if (!hits.length) return null;
      const from = pick(hits);
      const to = (from + (chance(0.5) ? 1 : -1) + steps.length) % steps.length;
      if (steps[to] > 0) return null;
      steps[to] = steps[from];
      steps[from] = 0;
      return kind;
    }
    case 'accent': {
      if (!hits.length) return null;
      const i = pick(hits);
      steps[i] = clamp(steps[i] * rand(0.6, 1.35), 0.15, 1);
      return kind;
    }
    case 'revert': {
      track.cur = [...track.base];
      return kind;
    }
  }
}

// ---------------------------------------------------------------- breakbeat slices

export const SLICE_STEPS = 4;

export interface SliceState {
  /** Which source slice plays in each slot. */
  order: number[];
  /** Slots that repeat their first half (a stutter). */
  stutter: boolean[];
  /** Slots that play their steps backwards. */
  reversed: boolean[];
}

export function freshSlices(count: number): SliceState {
  return {
    order: Array.from({ length: count }, (_, i) => i),
    stutter: Array(count).fill(false),
    reversed: Array(count).fill(false),
  };
}

export type SliceOp = 'swap' | 'copy' | 'stutter' | 'reverse' | 'restore' | 'reset';

/** Breakbeat mutates freely: whole slices (core hits included) are rearranged and scattered. */
export function mutateSlices(s: SliceState): SliceOp {
  const n = s.order.length;
  const op = weightedPick<SliceOp>(['swap', 'copy', 'stutter', 'reverse', 'restore', 'reset'], [3, 3, 2, 1, 2, 0.6]);
  const a = Math.floor(Math.random() * n);
  let b = Math.floor(Math.random() * n);
  if (b === a) b = (a + 1) % n;
  switch (op) {
    case 'swap':
      [s.order[a], s.order[b]] = [s.order[b], s.order[a]];
      break;
    case 'copy':
      s.order[b] = s.order[a];
      break;
    case 'stutter':
      s.stutter[a] = !s.stutter[a];
      break;
    case 'reverse':
      s.reversed[a] = !s.reversed[a];
      break;
    case 'restore':
      s.order[a] = a;
      s.stutter[a] = false;
      s.reversed[a] = false;
      break;
    case 'reset': {
      const f = freshSlices(n);
      s.order = f.order;
      s.stutter = f.stutter;
      s.reversed = f.reversed;
      break;
    }
  }
  return op;
}

/** Maps a position in the break (0-31) to the source step that should play there. */
export function sliceSource(s: SliceState, pos: number): number {
  const slot = Math.floor(pos / SLICE_STEPS);
  let off = pos % SLICE_STEPS;
  if (s.stutter[slot]) off = off % 2;
  if (s.reversed[slot]) off = SLICE_STEPS - 1 - off;
  return s.order[slot] * SLICE_STEPS + off;
}
