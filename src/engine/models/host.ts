// Faust voices (models running in an AudioWorklet, see ../faust): physical models for the tape flute, string
// ensemble, choir, felt piano, glass bells and the walking, muted and 808 basses, and drum kits for the lo-fi, techno,
// dub, ambient pulse and trip hop genres. The tile's generator decides every note and hit; the model plays it.
// The models load once per engine, in the background (models/bank.ts). A voice asked for before they have loaded
// joins in as soon as they have; until then its notes are dropped, which the tile's fade-in covers.
//
// For listening tests (compare.html), a tile can also have alternates: candidate voices (or drum kits) to compare
// against the one it ships with. All of them take the same notes, and only the chosen one is heard. Alternates are
// registered in engine/alternates, which only the compare page and the smoke test load; the app never does.
import type { DrumKit } from '../faust/kit';
import type { TileId } from '../../tiles';
import type { Core } from '../types';

export type { DrumKit };

export type ModelName = 'flute' | 'strings' | 'choir' | 'piano' | 'bells' | 'walk' | 'muted' | 'b808';
/** The genres that play on Faust kits. */
export type KitName = 'lofi' | 'techno' | 'dub' | 'ambient' | 'triphop';
export type Vowel = 'oo' | 'oh' | 'ah';

export interface ModelVoice {
  output: AudioNode;
  /** A note at t held for `hold` seconds (struck models ring on regardless). */
  note(t: number, midi: number, hold: number, vel: number): void;
  /** The choir's vowel, moving from t. */
  setVowel?(vowel: Vowel, t: number): void;
}

export interface ModelHost {
  create(name: ModelName): ModelVoice;
  createKit(name: KitName, main: AudioNode, echo: AudioNode | null): DrumKit;
}

/** A candidate voice for a melodic tile: it plays into `dest` and takes the same notes as the tile's own voice. */
export interface NoteAlternate {
  kind: 'notes';
  label: string;
  create(core: Core, dest: AudioNode): ModelVoice;
}

/** A candidate kit for a drum tile: it takes the same hits as the tile's own kit, into the genre's bus and echo. */
export interface HitAlternate {
  kind: 'hits';
  label: string;
  create(core: Core, main: AudioNode, echo: AudioNode | null): DrumKit;
}


export type Alternate = NoteAlternate | HitAlternate;

/** Per tile, the candidates to compare against its own voice, in the order the compare page offers them (B, C, ...). */
export type Alternates = Partial<Record<TileId, Alternate[]>>;

export interface Compare {
  alternates: Alternates;
  /** Which is heard: 0 the tiles' own voices, k their k-th alternate (tiles with fewer play their own). */
  choice: number;
  listeners: Set<() => void>;
}

export interface Models {
  /** Set once loaded. */
  host: ModelHost | null;
  ready: Promise<ModelHost>;
}

/** A tile's model voice, playing into `dest`. */
export function modelVoice(core: Core, name: ModelName, dest: AudioNode): ModelVoice {
  const output = new GainNode(core.ctx, { gain: 1 });
  output.connect(dest);
  let voice: ModelVoice | null = null;
  let vowel: { vowel: Vowel; t: number } | null = null;
  const attach = (host: ModelHost) => {
    voice = host.create(name);
    voice.output.connect(output);
    if (vowel) voice.setVowel?.(vowel.vowel, Math.max(vowel.t, core.ctx.currentTime));
  };
  if (core.models.host) attach(core.models.host);
  else core.models.ready.then(attach, () => {});
  return {
    output,
    note: (t, midi, hold, vel) => voice?.note(t, midi, hold, vel),
    setVowel(v, t) {
      vowel = { vowel: v, t };
      voice?.setVowel?.(v, t);
    },
  };
}

/**
 * Listening tests: one gain per voice of a tile (its own first, then its alternates), all into `dest`, with only the
 * chosen one open. They follow the compare choice as it changes.
 */
export function compareGains(core: Core, count: number, dest: AudioNode): GainNode[] {
  const { ctx } = core;
  const gains = Array.from({ length: count }, () => new GainNode(ctx, { gain: 0 }));
  for (const g of gains) g.connect(dest);
  const follow = (at = ctx.currentTime) => {
    const choice = core.compare && core.compare.choice < count ? core.compare.choice : 0;
    gains.forEach((g, i) => g.gain.setTargetAtTime(i === choice ? 1 : 0, at, 0.008));
  };
  follow(0);
  core.compare?.listeners.add(() => follow());
  return gains;
}

/** A tile's alternates of one kind (none outside listening tests). */
export function alternatesOf<K extends Alternate['kind']>(core: Core, id: TileId, kind: K): Extract<Alternate, { kind: K }>[] {
  return (core.compare?.alternates[id] ?? []).filter((a): a is Extract<Alternate, { kind: K }> => a.kind === kind);
}

/** A genre's Faust kit, playing into `main` and `echo`; hits before the kits have loaded are dropped. */
export function modelKit(core: Core, name: KitName, main: AudioNode, echo: AudioNode | null): DrumKit {
  let kit: DrumKit | null = null;
  const attach = (host: ModelHost) => (kit = host.createKit(name, main, echo));
  if (core.models.host) attach(core.models.host);
  else core.models.ready.then(attach, () => {});
  return { hit: (voice, t, vel, opts, echo) => kit?.hit(voice, t, vel, opts, echo) };
}

/**
 * The voice a melodic tile plays its notes on: `own` (its usual voice, built into the destination it is given), or in
 * listening tests, its own and its alternates side by side, all taking the same notes, only the chosen one heard.
 */
export function compared(core: Core, id: TileId, dest: AudioNode, own: (dest: AudioNode) => ModelVoice): ModelVoice {
  const alts = alternatesOf(core, id, 'notes');
  if (!alts.length) return own(dest);
  const gains = compareGains(core, alts.length + 1, dest);
  const voices = [own(gains[0]), ...alts.map((a, i) => a.create(core, gains[i + 1]))];
  return {
    output: dest,
    note: (t, midi, hold, vel) => voices.forEach((v) => v.note(t, midi, hold, vel)),
    setVowel: (vowel, t) => voices.forEach((v) => v.setVowel?.(vowel, t)),
  };
}

/** The voice a tile on a physical model plays its notes on (see `compared` for listening tests). */
export function tileVoice(core: Core, name: ModelName, dest: AudioNode): ModelVoice {
  return compared(core, name, dest, (d) => modelVoice(core, name, d));
}
