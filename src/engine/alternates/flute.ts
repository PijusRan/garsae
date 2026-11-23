// The warm flute candidate: an additive alto-flute model (faust/dsp/flute_warm.dsp) and a calmer writer, on the tape
// flute's own chain. The old flute's phrases wandered up and down the whole pentatonic by random jumps, which is not
// how a flute is played; these move by step, stay low, and begin and end on notes of the chord.
import fluteWarm from '../faust/gen/flute_warm';
import { createTapeFlute, type FlutePhrase } from '../instruments/keys';
import type { GeneratorAlternate } from '../models/host';
import { chance, clamp, pick, randInt } from '../random';
import { chordInPentatonic, notesInRange, pentatonicNotes } from '../theory';
import type { StepInfo } from '../types';
import { faustVoice } from './faust';

export { fluteWarm };

/** A phrase of two to four long notes: mostly steps in the key, never more than a third, ending on a chord tone. */
export function calmPhrase(s: StepInfo, last: number): FlutePhrase {
  const pool = pentatonicNotes(s.root, 55, 72);
  const chordTones = notesInRange(chordInPentatonic(s.root, s.chord), 55, 72);
  const nearest = (m: number, from: number[]) => from.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a), from[0]);
  const start = nearest(last, chordTones.length ? chordTones : pool);
  let idx = pool.indexOf(start);
  if (idx < 0) idx = Math.floor(pool.length / 2);
  const length = randInt(2, 4);
  let step = pick([0, 0, 4]);
  const phrase: FlutePhrase = [];
  for (let i = 0; i < length && step < 14; i++) {
    const beats = pick([2, 3, 4]);
    phrase.push({ step, midi: pool[idx], beats });
    idx = clamp(idx + pick([-1, -1, 1, 1, chance(0.25) ? 2 : -2]), 0, pool.length - 1);
    step += Math.round(beats * 4);
  }
  // Land on a chord tone, so the phrase resolves instead of hanging.
  if (chordTones.length) phrase[phrase.length - 1].midi = nearest(phrase[phrase.length - 1].midi, chordTones);
  return phrase;
}

/** The warm flute, as a generator: its own notes as well as its own sound, on the tape flute's chain and echo. */
export function warmFluteAlternate(trim: number): GeneratorAlternate {
  const voice = faustVoice('Warm flute', fluteWarm, 2, 0.4, trim);
  return {
    kind: 'generator',
    label: 'Warm flute',
    create: (core) => createTapeFlute(core, { voice: (c, dest) => voice.create(c, dest), phrase: calmPhrase }),
  };
}
