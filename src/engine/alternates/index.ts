// Alternates for listening tests: what compare.html offers as B, C, ... against each tile's own voice (A).
// To test a candidate, write its voice or kit, add it here, and set its trim so it plays as loud as the tile's own
// (npm run smoke -- --compare measures them). A melodic tile can take note voices if its notes go through compared()
// (models/host.ts); a drum tile can take kits. The app never imports this module.
import kitAmbient from '../faust/gen/kit_ambient';
import kitBossa from '../faust/gen/kit_bossa';
import kitBreaks from '../faust/gen/kit_breaks';
import kitDnb from '../faust/gen/kit_dnb';
import kitDub from '../faust/gen/kit_dub';
import kitHands from '../faust/gen/kit_hands';
import kitHouse from '../faust/gen/kit_house';
import kitLofi from '../faust/gen/kit_lofi';
import kitTechno from '../faust/gen/kit_techno';
import kitTriphop from '../faust/gen/kit_triphop';
import bass808 from '../faust/gen/bass_808';
import bassFretless from '../faust/gen/bass_fretless';
import bassMuted from '../faust/gen/bass_muted';
import type { Alternate, Alternates, ModelVoice, NoteAlternate } from '../models/host';
import type { Core } from '../types';
import type { TileId } from '../../tiles';
import { faustKit, faustVoice, prepareFaust } from './faust';
import { synthBells, synthChoir, synthFlute, synthPiano, synthStrings, synthWalk } from './synth';

/** A voice whose output is scaled by `trim`, so it is compared at the tile's own loudness. */
function trimmed(label: string, trim: number, create: (core: Core, dest: AudioNode) => ModelVoice): NoteAlternate {
  return {
    kind: 'notes',
    label,
    create(core, dest) {
      const level = new GainNode(core.ctx, { gain: trim });
      level.connect(dest);
      return create(core, level);
    },
  };
}

const OLD_SYNTH = 'Old synth voice';
const FAUST_KIT = 'Faust kit';
const FAUST_BASS = 'Faust model';

export const ALTERNATES: Alternates = {
  // The synth voices the physical models replaced.
  flute: [trimmed(OLD_SYNTH, 0.65, synthFlute)],
  strings: [trimmed(OLD_SYNTH, 0.97, synthStrings)],
  choir: [trimmed(OLD_SYNTH, 1.31, synthChoir)],
  piano: [trimmed(OLD_SYNTH, 1.3, synthPiano)],
  bells: [trimmed(OLD_SYNTH, 1.1, synthBells)],
  walk: [trimmed(OLD_SYNTH, 1.19, synthWalk)],
  // Round 2: a Faust kit per drum genre, each built from the drums that genre is played on.
  lofi: [faustKit(FAUST_KIT, kitLofi, ['kick', 'snare', 'hat'], 2.24)],
  techno: [faustKit(FAUST_KIT, kitTechno, ['kick', 'clap', 'openhat', 'hat', 'rim'], 2.37)],
  dub: [faustKit(FAUST_KIT, kitDub, ['kick', 'rim', 'hat', 'tom'], 2.11)],
  ambient: [faustKit(FAUST_KIT, kitAmbient, ['kick', 'shaker', 'tom'], 2.14)],
  breaks: [faustKit(FAUST_KIT, kitBreaks, ['kick', 'snare', 'ride', 'openhat'], 2.63)],
  hands: [faustKit(FAUST_KIT, kitHands, ['conga', 'conga', 'congaslap', 'tom', 'shaker'], 1.11)],
  house: [faustKit(FAUST_KIT, kitHouse, ['kick', 'clap', 'openhat', 'shaker', 'rim'], 5.15)],
  triphop: [faustKit(FAUST_KIT, kitTriphop, ['kick', 'snare', 'hat', 'rim'], 1.64)],
  dnb: [faustKit(FAUST_KIT, kitDnb, ['kick', 'snare', 'hat', 'shaker', 'openhat'], 6.5)],
  bossa: [faustKit(FAUST_KIT, kitBossa, ['kick', 'rim', 'shaker', 'hat'], 1.88)],
  // Round 2: basses that should sound like the real thing.
  fretless: [faustVoice(FAUST_BASS, bassFretless, 2, 0.2, 1.93)],
  muted: [faustVoice(FAUST_BASS, bassMuted, 2, 0.1, 7.9)],
  b808: [faustVoice(FAUST_BASS, bass808, 2, 0.05, 3.66)],
};

export const ALTERNATE_TILES = Object.keys(ALTERNATES) as TileId[];

/** Compiles the Faust alternates for a context; await it before switching tiles on with alternates. */
export function prepareAlternates(ctx: BaseAudioContext): Promise<void> {
  return prepareFaust(ctx, [kitAmbient, kitBossa, kitBreaks, kitDnb, kitDub, kitHands, kitHouse, kitLofi, kitTechno, kitTriphop, bass808, bassFretless, bassMuted]);
}

/** The labels a tile's slots go by: its own voice, then its alternates. */
export function slotLabels(id: TileId): string[] {
  return ['Current', ...(ALTERNATES[id] ?? []).map((a: Alternate) => a.label)];
}
