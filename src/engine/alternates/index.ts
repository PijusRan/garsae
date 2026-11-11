// Alternate voices for listening tests: what compare.html plays as B against each tile's own voice (A).
// To test a candidate, write its voice (a function from core and destination to a ModelVoice, like those in synth.ts),
// add it here, and set its trim so it plays as loud as the tile's own voice (npm run smoke -- --compare measures it).
// Only tiles that play through tileVoice() (models/host.ts) can take an alternate.
// The app never imports this module.
import type { Alternate, Alternates, ModelName, ModelVoice } from '../models/host';
import type { Core } from '../types';
import { synthBells, synthChoir, synthFlute, synthPiano, synthStrings, synthWalk } from './synth';

/** An alternate whose output is scaled by `trim`, so A and B are compared at the same loudness. */
function trimmed(label: string, trim: number, create: (core: Core, dest: AudioNode) => ModelVoice): Alternate {
  return {
    label,
    create(core, dest) {
      const level = new GainNode(core.ctx, { gain: trim });
      level.connect(dest);
      return create(core, level);
    },
  };
}

export const ALTERNATES: Alternates = {
  flute: trimmed('Old synth voice', 0.71, synthFlute),
  strings: trimmed('Old synth voice', 1, synthStrings),
  choir: trimmed('Old synth voice', 1.2, synthChoir),
  piano: trimmed('Old synth voice', 1.07, synthPiano),
  bells: trimmed('Old synth voice', 1.15, synthBells),
  walk: trimmed('Old synth voice', 1.12, synthWalk),
};

export const ALTERNATE_TILES = Object.keys(ALTERNATES) as ModelName[];
