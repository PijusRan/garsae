// Engine rule: no direct `.value` writes. Every live parameter change goes through glide().

/**
 * Smoothly moves an AudioParam to `value` with setTargetAtTime.
 * The time constant is roughly a third of the time it takes to get there.
 */
export function glide(
  ctx: BaseAudioContext,
  param: AudioParam,
  value: number,
  timeConstant = 0.25,
  at?: number,
): void {
  const t = Math.max(at ?? ctx.currentTime, ctx.currentTime);
  param.cancelScheduledValues(t);
  param.setTargetAtTime(value, t, Math.max(0.001, timeConstant));
}

/** Volume slider position (0-1) to gain, using a gentle perceptual curve. */
export const volumeToGain = (v: number): number => (v <= 0 ? 0 : v * v);

export interface EnvShape {
  peak: number;
  attack: number;
  /** Time to fall from peak to sustain. 0 skips the decay stage. */
  decay?: number;
  /** Sustain as a fraction of peak. */
  sustain?: number;
  release: number;
}

/**
 * Attack, decay, sustain for `hold` seconds, then release.
 * Returns the time after which the voice is silent and can be stopped.
 */
export function envelope(param: AudioParam, t: number, hold: number, s: EnvShape): number {
  const sustain = s.sustain ?? 1;
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(s.peak, t + s.attack);
  if (s.decay && s.decay > 0) param.setTargetAtTime(s.peak * sustain, t + s.attack, s.decay / 3);
  const relStart = Math.max(t + s.attack, t + hold);
  param.setTargetAtTime(0, relStart, s.release / 5);
  return relStart + s.release * 1.1;
}

/** Fast attack, exponential decay. Returns the end time. */
export function percussive(param: AudioParam, t: number, peak: number, attack: number, decay: number): number {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(Math.max(peak * 0.0005, 1e-5), t + attack + decay);
  param.setValueAtTime(0, t + attack + decay + 0.001);
  return t + attack + decay + 0.01;
}

/** Stops sources at `end` and disconnects the given nodes once the first source has ended. */
export function cleanupAt(
  sources: AudioScheduledSourceNode[],
  end: number,
  nodes: AudioNode[] = [],
): void {
  for (const s of sources) s.stop(end);
  if (sources.length === 0) return;
  sources[0].onended = () => {
    for (const s of sources) s.disconnect();
    for (const n of nodes) n.disconnect();
  };
}
