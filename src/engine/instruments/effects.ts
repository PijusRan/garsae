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
