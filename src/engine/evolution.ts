// How the Evolution slider (0 = static, 1 = constantly shifting) maps onto the music.
// Every generator reads these helpers so the behaviour is tuned in one place.
import { rand } from './random';

/** Chance, per pass of the 4-chord loop, that one chord gets swapped. 0 means never. */
export const chordSwapChance = (e: number): number => (e <= 0 ? 0 : 0.1 + 0.9 * e);

/** Largest allowed harmonic distance (shared-tone based, 1-4) for a swapped chord. */
export const chordMaxDistance = (e: number): number => 1 + Math.round(e * 3);

/** Drums consider a mutation every N bars: 8 bars when calm, every 2 bars when lively. */
export const drumMutationInterval = (e: number): number => Math.max(2, Math.round(8 - 6 * e));

/** Chance that a mutation actually happens when one is considered. */
export const drumMutationChance = (e: number): number => (e <= 0 ? 0 : 0.3 + 0.7 * e);

/** How many small edits one mutation makes. */
export const drumMutationSize = (e: number): number => 1 + Math.floor(rand(0, 1 + 2.5 * e));

/** Filter / texture movement depth, 0.1-1. Never fully frozen so pads still breathe. */
export const movementDepth = (e: number): number => 0.1 + 0.9 * e;

/** Filter / texture movement speed multiplier. */
export const movementRate = (e: number): number => 0.4 + 1.6 * e;

/** Note density multiplier for generators, 0.6-1.4. */
export const noteDensity = (e: number): number => 0.6 + 0.8 * e;
