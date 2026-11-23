// The warm pad and drone as they were, for the compare page: both were called harsh, and the softer tones in
// instruments/pads.ts replaced them in round 6. The generators are the tiles' own, so A/B hears only the tone.
import { BRIGHT_DRONE, SAW_PAD, createDrone, createPad } from '../instruments/pads';
import type { Core, Instrument } from '../types';

export const sawPad = (core: Core): Instrument => createPad(core, SAW_PAD);
export const brightDrone = (core: Core): Instrument => createDrone(core, BRIGHT_DRONE);
