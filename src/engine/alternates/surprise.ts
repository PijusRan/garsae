// The Surprise me that round 5's styles replaced, kept for reference on the compare page.
import { allTiles, type MixState } from '../../state/mix';
import type { TileId } from '../../tiles';

const round2 = (v: number) => Math.round(v * 100) / 100;
const between = (lo: number, hi: number) => round2(lo + Math.random() * (hi - lo));
const pickOne = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

/**
 * A random but balanced, calm mix, each part picked on its own. Guardrails:
 * - always one harmonic bed, at most 6 tiles in total. The bed is warm pad, drone, choir, strings, or a
 *   melodic instrument over a bass (the bass gives it a floor), each a fifth of the time, so no tile dominates
 * - at most one extra melodic layer and at most one bass
 * - at most one drum genre; busy genres (breakbeat, techno, motorik, drum and bass) are rarer and kept quiet
 * - at most one atmosphere and at most one noise colour, both low in the mix
 * - effect tiles (AM, wobble) are never picked
 * - Evolution stays in the calm 0.15-0.5 range; BPM and key stay random (60-90)
 */
export function oldSurpriseMix(): MixState {
  const on: Partial<Record<TileId, number>> = {};
  const basses: TileId[] = ['sub', 'walk', 'pulse', 'glide', 'fm', 'rolling', 'reese', 'fretless', 'b808', 'muted'];
  const bed = pickOne(['pad', 'drone', 'choir', 'strings', 'tune'] as const);
  if (bed === 'tune') {
    on[pickOne<TileId>(['arp', 'bells', 'epiano', 'piano', 'vibes'])] = between(0.4, 0.6);
    on[pickOne(basses)] = between(0.35, 0.55);
  } else {
    on[bed] = between(0.5, 0.75);
  }
  if (bed === 'drone' || Math.random() < 0.6) {
    const melodic = pickOne((['bells', 'arp', 'epiano', 'piano', 'vibes', 'flute'] as TileId[]).filter((id) => on[id] === undefined));
    on[melodic] = between(0.3, 0.55);
  }
  if (bed !== 'tune' && Math.random() < 0.55) on[pickOne(basses)] = between(0.35, 0.55);
  if (Math.random() < 0.75) {
    const drum = pickOne<TileId>(['lofi', 'lofi', 'dub', 'ambient', 'ambient', 'hands', 'hands', 'bossa', 'triphop', 'motorik', 'techno', 'breaks', 'dnb']);
    const busy = drum === 'breaks' || drum === 'techno' || drum === 'dnb' || drum === 'motorik';
    on[drum] = busy ? between(0.3, 0.42) : between(0.35, 0.55);
  }
  if (Math.random() < 0.5) on[pickOne<TileId>(['crackle', 'wind', 'hum'])] = between(0.2, 0.4);
  if (Math.random() < 0.35) on[pickOne<TileId>(['brown', 'pink', 'green'])] = between(0.15, 0.3);

  // Enforce the size cap by dropping the least essential layers first.
  const order: TileId[] = ['brown', 'pink', 'green', 'crackle', 'wind', 'hum'];
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
