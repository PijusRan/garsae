// Effect tiles: they shape the whole mix through master parameters and make no sound alone.
import type { Core, Instrument } from '../types';

/** Amplitude modulation rate, in the beta range (~12-20 Hz). */
export const AM_RATE_HZ = 16;

export function createAmplitudeMod(core: Core): Instrument {
  return {
    setLevel(level) {
      // Full volume = 50% dips. The design keeps this gentle.
      core.master.setModulation({ rate: AM_RATE_HZ, depth: level * 0.5 });
    },
  };
}

export function createWobble(core: Core): Instrument {
  return {
    setLevel(level) {
      core.master.setWobble(level);
    },
  };
}

/** Spatial effects: each turns its level into one master parameter. */
function masterParam(set: (core: Core, level: number) => void) {
  return (core: Core): Instrument => ({ setLevel: (level) => set(core, level) });
}

export const createWidth = masterParam((core, level) => core.master.setWidth(level));
export const createOrbit = masterParam((core, level) => core.master.setOrbit(level));
export const createHall = masterParam((core, level) => core.master.setHall(level));
