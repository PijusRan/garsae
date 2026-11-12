// Round 3 candidate for the soft arpeggio: a rhythm motif. The arp's own writer makes a new figure every bar; this one
// keeps a figure (rhythm, contour and dynamics) and plays it over each chord, so the rhythm and shape come back while
// the pitches follow the chords. It changes only as the chord loop comes round: usually not at all, sometimes by one
// small edit, and after a few loops it is retired for a new one, so no figure stays long enough to become a tune.
import { arpFigure, createArp, placeArp, type ArpFigure, type ArpWriter } from '../instruments/pads';
import { chance, clamp, pick, rand } from '../random';
import type { Core, Instrument } from '../types';

/** How many chord loops a figure lasts (a loop is 8-16 bars): a few minutes, less with Evolution. */
const figureLife = (evolution: number): number => Math.max(2, Math.round(rand(4, 6) - 3 * evolution));

/** Moves one note (never the first) an eighth earlier or later, if that keeps the notes in order within the bar. */
function shift(f: ArpFigure): ArpFigure | null {
  const i = 1 + Math.floor(Math.random() * (f.steps.length - 1));
  if (i >= f.steps.length) return null;
  const to = f.steps[i] + pick([-2, 2]);
  const after = f.steps[i + 1] ?? 16;
  if (to <= f.steps[i - 1] || to >= after) return null;
  const steps = [...f.steps];
  steps[i] = to;
  return { ...f, steps };
}

/** Leaves one note out (never the first), joining the moves either side of it. */
function drop(f: ArpFigure): ArpFigure | null {
  if (f.steps.length <= 2) return null;
  const i = 1 + Math.floor(Math.random() * (f.steps.length - 1));
  const moves = [...f.moves];
  if (i < f.steps.length - 1) moves.splice(i - 1, 2, clamp(moves[i - 1] + moves[i], -2, 2));
  else moves.splice(i - 1, 1);
  return { steps: f.steps.filter((_, k) => k !== i), moves, vels: f.vels.filter((_, k) => k !== i) };
}

/** Adds a note on a free eighth after the first, a step on from the note before it. */
function add(f: ArpFigure): ArpFigure | null {
  const free = [2, 4, 6, 8, 10, 12, 14].filter((st) => st > f.steps[0] && !f.steps.includes(st));
  if (!free.length) return null;
  const at = pick(free);
  const i = f.steps.findIndex((st) => st > at);
  const pos = i < 0 ? f.steps.length : i;
  const dir = Math.sign(f.moves[pos - 1] ?? f.moves[0] ?? 1) || 1;
  const steps = [...f.steps];
  const moves = [...f.moves];
  const vels = [...f.vels];
  steps.splice(pos, 0, at);
  moves.splice(pos - 1, 0, dir);
  vels.splice(pos, 0, rand(0.55, 0.7));
  return { steps, moves, vels };
}

/** Turns one move round, so the line goes the other way for a step. */
function flip(f: ArpFigure): ArpFigure | null {
  if (!f.moves.length) return null;
  const i = Math.floor(Math.random() * f.moves.length);
  const moves = [...f.moves];
  moves[i] = -moves[i];
  return { ...f, moves };
}

/** One small edit, picked from those that fit this figure. */
function vary(f: ArpFigure): ArpFigure {
  const edits = [shift, drop, add, flip];
  for (let i = edits.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [edits[i], edits[j]] = [edits[j], edits[i]];
  }
  for (const edit of edits) {
    const next = edit(f);
    if (next) return next;
  }
  return f;
}

/** The motif writer: one figure, edited or replaced only where the chord loop comes round. */
export function motifWriter(): ArpWriter {
  let figure: ArpFigure | null = null;
  let loopsLeft = 0;
  const fresh = (evolution: number) => {
    figure = arpFigure(evolution);
    loopsLeft = figureLife(evolution);
  };
  return {
    bar(s) {
      if (!figure || !s.loopStarted) return;
      if (--loopsLeft <= 0) fresh(s.evolution);
      else if (chance(0.15 + 0.45 * s.evolution)) figure = vary(figure);
    },
    phrase(s, last) {
      if (!figure) fresh(s.evolution);
      return placeArp(s, figure!, last);
    },
  };
}

export const createMotifArp = (core: Core): Instrument => createArp(core, motifWriter());
