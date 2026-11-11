// Physical-model voices (Faust models running in an AudioWorklet, see ../faust) for the tape flute, string ensemble,
// choir, felt piano, glass bells and walking bass. The tile's generator decides every note; the model plays it.
// The models load once per engine, in the background (models/bank.ts). A voice asked for before they have loaded
// joins in as soon as they have; until then its notes are dropped, which the tile's fade-in covers.
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
