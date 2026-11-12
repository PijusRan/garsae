// Alternates for listening tests: what compare.html offers as B, C, ... against each tile's own voice (A).
// To test a candidate, write its voice or kit, add it here, and set its trim so it plays as loud as the tile's own
// (npm run smoke -- --compare measures them). A melodic tile can take note voices if its notes go through compared()
// (models/host.ts); a drum tile can take kits; any tile can take a whole generator, to compare what it plays.
// Every new listening test is a new round: give its candidates the next round number and add it to ROUNDS with what
// to listen for. The compare page opens on the newest round, marked as the one to test. The app never imports this.
import kitBossa from '../faust/gen/kit_bossa';
import kitDnb from '../faust/gen/kit_dnb';
import kitHands from '../faust/gen/kit_hands';
import kitHouse from '../faust/gen/kit_house';
import bassFretless from '../faust/gen/bass_fretless';
import type { Alternate, Alternates, HitAlternate, ModelVoice, NoteAlternate } from '../models/host';
import { createFigureEveryBarArp } from './arp';
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

export interface Round {
  round: number;
  title: string;
  /** Decided and in the app: nothing left to test in it. */
  shipped?: boolean;
  /** What the test is for, and what to listen for. */
  listen: string;
}

/** Every listening round, oldest first. The last is the one being tested now. */
export const ROUNDS: Round[] = [
  {
    round: 1,
    title: 'Physical models',
    shipped: true,
    listen: 'Shipped. The synth voices the physical models replaced, kept for reference.',
  },
  {
    round: 2,
    title: 'Faust kits and basses',
    shipped: true,
    listen:
      'Lo-fi, techno, dub, ambient, trip hop, muted and 808 shipped on Faust; B is the synth they replaced. ' +
      'Hand drums, deep house, liquid DnB, bossa nova and fretless were not chosen; B is the Faust candidate.',
  },
  {
    round: 3,
    title: 'Arp motif, for focus',
    shipped: true,
    listen:
      'Shipped. A keeps one rhythm and shape, changing it only as the chord loop comes round and replacing it every ' +
      'few loops. B is the writer it replaced, a new figure every bar. The notes differ, so judge the feel.',
  },
];

export const CURRENT_ROUND = ROUNDS[ROUNDS.length - 1].round;

const inRound = (round: number, ...alts: Omit<Alternate, 'round'>[]): Alternate[] =>
  alts.map((a) => ({ ...a, round }) as Alternate);

const OLD_SYNTH = 'Old synth voice';
const FAUST_KIT = 'Faust kit';
const FAUST_BASS = 'Faust model';

export const ALTERNATES: Alternates = {
  // The synth voices the physical models replaced.
  flute: inRound(1, trimmed(OLD_SYNTH, 0.65, synthFlute)),
  strings: inRound(1, trimmed(OLD_SYNTH, 0.97, synthStrings)),
  choir: inRound(1, trimmed(OLD_SYNTH, 1.31, synthChoir)),
  piano: inRound(1, trimmed(OLD_SYNTH, 1.3, synthPiano)),
  bells: inRound(1, trimmed(OLD_SYNTH, 1.1, synthBells)),
  walk: inRound(1, trimmed(OLD_SYNTH, 1.19, synthWalk)),
  // What the genres and basses chosen in round 2 replaced.
  lofi: inRound(2, oldSynthKit),
  techno: inRound(2, oldSynthKit),
  dub: inRound(2, oldSynthKit),
  ambient: inRound(2, oldSynthKit),
  triphop: inRound(2, oldSynthKit),
  muted: inRound(2, trimmed(OLD_SYNTH, 1, synthMuted)),
  b808: inRound(2, trimmed(OLD_SYNTH, 1, synth808)),
  // Round 2 candidates that were not chosen, kept for another listen.
  hands: inRound(2, faustKit(FAUST_KIT, kitHands, ['conga', 'conga', 'congaslap', 'tom', 'shaker'], 1.11)),
  house: inRound(2, faustKit(FAUST_KIT, kitHouse, ['kick', 'clap', 'openhat', 'shaker', 'rim'], 5.15)),
  dnb: inRound(2, faustKit(FAUST_KIT, kitDnb, ['kick', 'snare', 'hat', 'shaker', 'openhat'], 6.5)),
  bossa: inRound(2, faustKit(FAUST_KIT, kitBossa, ['kick', 'rim', 'shaker', 'hat'], 1.88)),
  fretless: inRound(2, faustVoice(FAUST_BASS, bassFretless, 2, 0.2, 1.93)),
  // Round 3: the writer the arp's rhythm motif replaced.
  arp: inRound(3, { kind: 'generator', label: 'Figure every bar', create: createFigureEveryBarArp }),
};

export const ALTERNATE_TILES = Object.keys(ALTERNATES) as TileId[];

/** Compiles the Faust alternates for a context; await it before switching tiles on with alternates. */
export function prepareAlternates(ctx: BaseAudioContext): Promise<void> {
  return prepareFaust(ctx, [kitBossa, kitDnb, kitHands, kitHouse, bassFretless]);
}

/** The round a tile's alternates belong to (its newest). */
export function roundOf(id: TileId): number {
  return Math.max(0, ...(ALTERNATES[id] ?? []).map((a) => a.round));
}

/** The labels a tile's slots go by: its own voice, then its alternates. */
export function slotLabels(id: TileId): string[] {
  return ['Current', ...(ALTERNATES[id] ?? []).map((a: Alternate) => a.label)];
}
