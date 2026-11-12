// Round 3 reference for the soft arpeggio: the writer it had before the motif shipped, a new figure every bar.
import { arpFigure, createArp, placeArp } from '../instruments/pads';
import type { Core, Instrument } from '../types';

export const createFigureEveryBarArp = (core: Core): Instrument =>
  createArp(core, { phrase: (s, last) => placeArp(s, arpFigure(s.evolution), last) });
