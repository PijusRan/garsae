// Surprise me, by style: a candidate in compare round 5 against surpriseMix() in mix.ts. A roll picks a style first
// (lo-fi, ambient, dub, ...), then fills it from that style's own weighted lists, so the parts belong together. The
// tempo comes from the drum style that was picked. Styles come round in a shuffled bag, so every style is heard before
// any comes back, and a roll steers clear of the last one's style, sounds and key.
import { TILE_BY_ID, type TileId } from '../tiles';
import { allTiles, type MixState } from './mix';

/** A rolled mix, with the tempo and key it should start at. The mix itself leaves them random (null). */
export interface SurpriseRoll {
  mix: MixState;
  bpm: number;
  key: number;
  style: string;
}

type Pool = Partial<Record<TileId, number>>;

interface Style {
  name: string;
  /** How many times it goes into each bag. */
  weight: number;
  /** The harmonic bed, always one. A melodic bed (piano, vibes, ...) always gets a bass under it. */
  bed: Pool;
  melodic: [Pool, number];
  bass: [Pool, number];
  drums: [Pool, number];
  atmosphere: [Pool, number];
  noise: [Pool, number];
  /** Chance of a little tape wobble over the whole mix. */
  wobble: number;
  /** Tempo with no drums. */
  bpm: [number, number];
  evolution: [number, number];
}

/** Each drum style's calm tempo. Motorik and breakbeat run at double time up to 90 bpm, and DnB is written doubled. */
const DRUM_BPM: Partial<Record<TileId, [number, number]>> = {
  lofi: [70, 88],
  triphop: [60, 74],
  dub: [64, 78],
  ambient: [60, 80],
  hands: [66, 84],
  bossa: [72, 86],
  motorik: [62, 72],
  techno: [84, 90],
  breaks: [80, 88],
  dnb: [84, 88],
};

const STYLES: Style[] = [
  {
    name: 'Lo-fi study',
    weight: 3,
    bed: { epiano: 3, piano: 2, pad: 1, vibes: 1 },
    melodic: [{ piano: 1, vibes: 1, bells: 1, flute: 1 }, 0.5],
    bass: [{ muted: 2, walk: 1, sub: 1, fretless: 1 }, 0.7],
    drums: [{ lofi: 3, triphop: 1 }, 0.9],
    atmosphere: [{ crackle: 3, hum: 1 }, 0.75],
    noise: [{ brown: 1, pink: 1 }, 0.2],
    wobble: 0.3,
    bpm: [68, 84],
    evolution: [0.2, 0.45],
  },
  {
    name: 'Ambient drift',
    weight: 3,
    bed: { pad: 1, drone: 1, choir: 1, strings: 1 },
    melodic: [{ bells: 2, piano: 1, flute: 1, arp: 1 }, 0.65],
    bass: [{ sub: 1, glide: 1 }, 0.35],
    drums: [{ ambient: 1 }, 0.4],
    atmosphere: [{ wind: 2, hum: 1 }, 0.5],
    noise: [{ brown: 1, pink: 1, green: 1 }, 0.4],
    wobble: 0,
    bpm: [60, 72],
    evolution: [0.15, 0.4],
  },
  {
    name: 'Dub',
    weight: 2,
    bed: { pad: 2, epiano: 2, drone: 1 },
    melodic: [{ bells: 1, vibes: 1, arp: 1, flute: 1 }, 0.45],
    bass: [{ sub: 2, rolling: 2, b808: 1, glide: 1 }, 0.95],
    drums: [{ dub: 1 }, 0.95],
    atmosphere: [{ hum: 1, crackle: 1, wind: 1 }, 0.4],
    noise: [{ brown: 1 }, 0.2],
    wobble: 0.1,
    bpm: [64, 76],
    evolution: [0.2, 0.45],
  },
  {
    name: 'Bossa lounge',
    weight: 2,
    bed: { epiano: 2, vibes: 2, piano: 1, strings: 1 },
    melodic: [{ flute: 2, vibes: 1, piano: 1, bells: 1 }, 0.55],
    bass: [{ walk: 3, fretless: 2, muted: 2 }, 0.9],
    drums: [{ bossa: 3, hands: 2 }, 0.9],
    atmosphere: [{ crackle: 1, wind: 1 }, 0.35],
    noise: [{ pink: 1 }, 0.1],
    wobble: 0.15,
    bpm: [72, 84],
    evolution: [0.2, 0.45],
  },
  {
    name: 'Night trip hop',
    weight: 2,
    bed: { strings: 1, pad: 1, choir: 1, epiano: 1 },
    melodic: [{ piano: 1, bells: 1, flute: 1 }, 0.5],
    bass: [{ reese: 1, b808: 1, sub: 1, glide: 1 }, 0.85],
    drums: [{ triphop: 3, lofi: 1 }, 0.9],
    atmosphere: [{ crackle: 1, hum: 1 }, 0.5],
    noise: [{ brown: 1 }, 0.2],
    wobble: 0.2,
    bpm: [60, 72],
    evolution: [0.2, 0.45],
  },
  {
    name: 'Organic',
    weight: 2,
    bed: { strings: 1, drone: 1, choir: 1, pad: 1 },
    melodic: [{ flute: 3, vibes: 1, piano: 1, bells: 1 }, 0.7],
    bass: [{ fretless: 1, sub: 1, walk: 1 }, 0.5],
    drums: [{ hands: 2, ambient: 1 }, 0.85],
    atmosphere: [{ wind: 2, crackle: 1 }, 0.5],
    noise: [{ green: 1 }, 0.25],
    wobble: 0,
    bpm: [62, 76],
    evolution: [0.15, 0.45],
  },
  {
    name: 'Motorik drive',
    weight: 1,
    bed: { pad: 1, drone: 1, strings: 1 },
    melodic: [{ arp: 3, bells: 1, epiano: 1 }, 0.8],
    bass: [{ pulse: 3, fm: 2 }, 0.95],
    drums: [{ motorik: 1 }, 1],
    atmosphere: [{ hum: 1, wind: 1 }, 0.25],
    noise: [{ pink: 1 }, 0.1],
    wobble: 0,
    bpm: [62, 72],
    evolution: [0.25, 0.5],
  },
  {
    name: 'Liquid',
    weight: 1,
    bed: { pad: 2, strings: 2, choir: 1, epiano: 1 },
    melodic: [{ piano: 1, bells: 1, arp: 1 }, 0.6],
    bass: [{ reese: 2, sub: 2, rolling: 1, glide: 1 }, 0.95],
    drums: [{ dnb: 3, breaks: 1 }, 1],
    atmosphere: [{ wind: 1 }, 0.25],
    noise: [{ pink: 1 }, 0.15],
    wobble: 0,
    bpm: [84, 88],
    evolution: [0.25, 0.5],
  },
  {
    name: 'Minimal',
    weight: 1,
    bed: { drone: 1, pad: 1 },
    melodic: [{ arp: 1, bells: 1, epiano: 1 }, 0.6],
    bass: [{ pulse: 1, fm: 1, sub: 1, glide: 1 }, 0.9],
    drums: [{ techno: 1 }, 1],
    atmosphere: [{ hum: 1 }, 0.3],
    noise: [{ brown: 1 }, 0.15],
    wobble: 0,
    bpm: [84, 90],
    evolution: [0.25, 0.5],
  },
];

const round2 = (v: number) => Math.round(v * 100) / 100;
const between = (lo: number, hi: number) => round2(lo + Math.random() * (hi - lo));
const intBetween = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

/** A weighted pick from a pool, skipping what is taken and, while anything else is left, what the last roll used. */
function draw(pool: Pool, taken: Partial<Record<TileId, number>>, avoid: ReadonlySet<TileId>): TileId | null {
  const open = (Object.entries(pool) as [TileId, number][]).filter(([id]) => taken[id] === undefined);
  const fresh = open.filter(([id]) => !avoid.has(id));
  const from = fresh.length ? fresh : open;
  let r = Math.random() * from.reduce((sum, [, w]) => sum + w, 0);
  for (const [id, w] of from) if ((r -= w) < 0) return id;
  return from.length ? from[from.length - 1][0] : null;
}

function shuffled<T>(xs: T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A new bag of styles, each in it as often as its weight, never starting on `last` or putting one twice in a row. */
function newBag(last: Style | null): Style[] {
  for (let tries = 0; tries < 50; tries++) {
    const bag = shuffled(STYLES.flatMap((s) => Array<Style>(s.weight).fill(s)));
    // Drawn from the end, so the end is what plays first.
    const seq = [last, ...[...bag].reverse()];
    if (seq.every((s, i) => i === 0 || s !== seq[i - 1])) return bag;
  }
  return shuffled(STYLES.filter((s) => s !== last));
}

/** A Surprise me with its own memory: its bag of styles and its last roll. */
export function createSurprise(): () => SurpriseRoll {
  let bag: Style[] = [];
  let lastStyle: Style | null = null;
  let last: SurpriseRoll | null = null;

  return () => {
    if (!bag.length) bag = newBag(lastStyle);
    const style = bag.pop()!;
    const avoid = new Set<TileId>(last ? (Object.keys(last.mix.tiles) as TileId[]).filter((id) => last!.mix.tiles[id].on) : []);
    const on: Partial<Record<TileId, number>> = {};
    const add = ([pool, p]: [Pool, number], lo: number, hi: number): TileId | null => {
      if (Math.random() >= p) return null;
      const id = draw(pool, on, avoid);
      if (id) on[id] = between(lo, hi);
      return id;
    };

    const bed = draw(style.bed, on, avoid)!;
    const melodicBed = TILE_BY_ID[bed].family === 'melodic';
    on[bed] = melodicBed ? between(0.4, 0.6) : between(0.5, 0.75);
    const melodic = add(style.melodic, 0.3, 0.55);
    add([style.bass[0], melodicBed ? 1 : style.bass[1]], 0.35, 0.55);
    const drum = add(style.drums, 0, 0);
    if (drum) on[drum] = TILE_BY_ID[drum].family === 'calm' ? between(0.35, 0.55) : between(0.3, 0.42);
    add(style.atmosphere, 0.2, 0.4);
    add(style.noise, 0.15, 0.3);
    // Never a thin mix: at least three sounds, filled out with a melodic layer, then an atmosphere.
    if (Object.keys(on).length < 3 && !melodic) add([style.melodic[0], 1], 0.3, 0.55);
    if (Object.keys(on).length < 3) add([style.atmosphere[0], 1], 0.2, 0.4);
    if (Object.keys(on).length < 3) add([{ brown: 1, pink: 1, green: 1 }, 1], 0.15, 0.3);
    if (Math.random() < style.wobble) on.wobble = between(0.15, 0.3);

    const tiles = allTiles(on);
    // Now and then one part wanders more than the rest: a melodic layer with an Evolution of its own.
    if (melodic && Math.random() < 0.25) tiles[melodic].evolution = between(0.55, 0.8);

    const [lo, hi] = (drum && DRUM_BPM[drum]) || style.bpm;
    let key = intBetween(0, 11);
    if (last && key === last.key) key = (key + intBetween(1, 11)) % 12;
    last = { mix: { tiles, evolution: between(...style.evolution), bpm: null, key: null }, bpm: intBetween(lo, hi), key, style: style.name };
    lastStyle = style;
    return last;
  };
}
