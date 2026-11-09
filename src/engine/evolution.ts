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

/**
 * Instrument handovers: when the chord loop comes round, a tile may hand over to a sibling.
 * Chance per tile per loop pass (a loop is ~12 bars). Never below 0.4; at 0.5 a tile changes about
 * every 15 minutes, at 0.7 about every 6, at 1 about every 3.
 */
export const handoverChance = (e: number): number => (e < 0.4 ? 0 : 0.01 + 0.32 * (e - 0.4));

/** Fewest bars between any two handovers in the mix: 64 when calm, 32 at full Evolution. */
export const handoverCooldownBars = (e: number): number => Math.round(64 - 32 * e);

/** A tile plays at least this many loops before it can hand over, and nothing changes this soon after Play. */
export const HANDOVER_GRACE_LOOPS = 2;
