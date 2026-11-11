// Physical-model voices (Faust models running in an AudioWorklet, see ../faust) for the tape flute, string ensemble,
// choir, felt piano, glass bells and walking bass. The tile's generator decides every note; the model plays it.
// The models load once per engine, in the background (models/bank.ts). A voice asked for before they have loaded
// joins in as soon as they have; until then its notes are dropped, which the tile's fade-in covers.
//
// For listening tests (compare.html), a tile can also have an alternate voice: a candidate to compare against the
// one it ships with. Both get the same notes, and one control crossfades between them. Alternates are registered in
// engine/alternates, which only the compare page and the smoke test load; the app never does.
import type { Core } from '../types';

export type ModelName = 'flute' | 'strings' | 'choir' | 'piano' | 'bells' | 'walk';
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
}

/** A candidate voice for a tile: it plays into `dest` and takes the same notes as the tile's own voice. */
export interface Alternate {
  label: string;
  create(core: Core, dest: AudioNode): ModelVoice;
}

export type Alternates = Partial<Record<ModelName, Alternate>>;

export interface Compare {
  alternates: Alternates;
  /** 0 hears the tiles' own voices, 1 the alternates. */
  ab: AudioNode;
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
 * The voice a tile plays its notes on: its physical model, or when comparing, the model and its alternate side by
 * side, crossfaded by the compare control.
 */
export function tileVoice(core: Core, name: ModelName, dest: AudioNode): ModelVoice {
  const alternate = core.compare?.alternates[name];
  if (!core.compare || !alternate) return modelVoice(core, name, dest);
  const { ctx } = core;
  const own = new GainNode(ctx, { gain: 1 });
  const other = new GainNode(ctx, { gain: 0 });
  const invert = new GainNode(ctx, { gain: -1 });
  core.compare.ab.connect(other.gain);
  core.compare.ab.connect(invert).connect(own.gain);
  own.connect(dest);
  other.connect(dest);
  const a = modelVoice(core, name, own);
  const b = alternate.create(core, other);
  return {
    output: own,
    note(t, midi, hold, vel) {
      a.note(t, midi, hold, vel);
      b.note(t, midi, hold, vel);
    },
    setVowel(v, t) {
      a.setVowel?.(v, t);
      b.setVowel?.(v, t);
    },
  };
}
