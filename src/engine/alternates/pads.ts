// Softer tones for the warm pad and the drone, for listening tests: both were called harsh. The generators are the
// tiles' own (instruments/pads.ts), so A/B hears only the tone, not different notes.
import { createDrone, createPad, type DroneTone, type PadTone } from '../instruments/pads';
import type { Core, Instrument } from '../types';

/** Triangles in place of saws, through a much darker filter that never opens past the mids, and less chorus. */
const SOFT_PAD: PadTone = { wave: 'triangle', open: 5, ceiling: 3200, filter: 1900, swing: 700, chorus: 0.6, attack: 2.4 };

/** The shipped drone with its top taken off: a darker filter, fewer harmonics, and no third harmonic voice. */
const SOFT_DRONE: DroneTone = {
  voices: [
    { ratio: 0.5, gain: 0.07, pan: 0, breath: 0 },
    { ratio: 1, gain: 0.16, pan: 0, breath: 0 },
    { ratio: 1.5, gain: 0.07, pan: -0.3, breath: 0.043 },
    { ratio: 2, gain: 0.06, pan: 0.3, breath: 0.061 },
  ],
  harmonics: [0, 1, 0.12, 0.02],
  cutoff: 900,
};

export const softPad = (core: Core): Instrument => createPad(core, SOFT_PAD);
export const softDrone = (core: Core): Instrument => createDrone(core, SOFT_DRONE);
