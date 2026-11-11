// Alternates for listening tests: what compare.html offers as B, C, ... against each tile's own voice (A).
// To test a candidate, write its voice or kit, add it here, and set its trim so it plays as loud as the tile's own
// (npm run smoke -- --compare measures them). A melodic tile can take note voices if its notes go through compared()
// (models/host.ts); a drum tile can take kits. The app never imports this module.
import kitBossa from '../faust/gen/kit_bossa';
import kitDnb from '../faust/gen/kit_dnb';
import kitHands from '../faust/gen/kit_hands';
import kitHouse from '../faust/gen/kit_house';
import bassFretless from '../faust/gen/bass_fretless';
import type { Alternate, Alternates, HitAlternate, ModelVoice, NoteAlternate } from '../models/host';
import type { Core } from '../types';
import type { TileId } from '../../tiles';
import { faustKit, faustVoice, prepareFaust } from './faust';
import { synthKit } from '../drums/genres';
import { synth808, synthBells, synthChoir, synthFlute, synthMuted, synthPiano, synthStrings, synthWalk } from './synth';

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

/** The synth kit the five genres on Faust kits used to play. */
const oldSynthKit: HitAlternate = { kind: 'hits', label: 'Old synth kit', create: (core, main, echo) => synthKit(core, main, echo) };

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
  // What the genres and basses chosen in round 2 replaced.
  lofi: [oldSynthKit],
  techno: [oldSynthKit],
  dub: [oldSynthKit],
  ambient: [oldSynthKit],
  triphop: [oldSynthKit],
  muted: [trimmed(OLD_SYNTH, 1, synthMuted)],
  b808: [trimmed(OLD_SYNTH, 1, synth808)],
  // Round 2 candidates that were not chosen, kept for another listen.
  hands: [faustKit(FAUST_KIT, kitHands, ['conga', 'conga', 'congaslap', 'tom', 'shaker'], 1.11)],
  house: [faustKit(FAUST_KIT, kitHouse, ['kick', 'clap', 'openhat', 'shaker', 'rim'], 5.15)],
  dnb: [faustKit(FAUST_KIT, kitDnb, ['kick', 'snare', 'hat', 'shaker', 'openhat'], 6.5)],
  bossa: [faustKit(FAUST_KIT, kitBossa, ['kick', 'rim', 'shaker', 'hat'], 1.88)],
  fretless: [faustVoice(FAUST_BASS, bassFretless, 2, 0.2, 1.93)],
};

export const ALTERNATE_TILES = Object.keys(ALTERNATES) as TileId[];

/** Compiles the Faust alternates for a context; await it before switching tiles on with alternates. */
export function prepareAlternates(ctx: BaseAudioContext): Promise<void> {
  return prepareFaust(ctx, [kitBossa, kitDnb, kitHands, kitHouse, bassFretless]);
}

/** The labels a tile's slots go by: its own voice, then its alternates. */
export function slotLabels(id: TileId): string[] {
  return ['Current', ...(ALTERNATES[id] ?? []).map((a: Alternate) => a.label)];
}
