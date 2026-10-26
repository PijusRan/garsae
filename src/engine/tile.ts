import type { TileMeta } from '../tiles';
import { glide, volumeToGain } from './params';
import type { Core, Instrument, StepInfo } from './types';

/** Fade time constants (seconds). Gentle: tiles never pop in or out. */
const FADE_IN = 0.9;
const FADE_OUT = 0.7;
const VOLUME_MOVE = 0.15;
/** After this long a faded-out tile stops scheduling and releases its sources. */
const SILENT_AFTER = 5;

/**
 * Wraps one instrument with its gain bus and reverb send.
 * Toggling fades the bus instead of cancelling notes already scheduled.
 */
export class Tile {
  on = false;
  volume: number;
  private active = false;
  private offAt = 0;
  private bus: GainNode;

  constructor(
    private core: Core,
    readonly meta: TileMeta,
    readonly instrument: Instrument,
  ) {
    const { ctx, master } = core;
    this.volume = meta.defaultVolume;
    this.bus = new GainNode(ctx, { gain: 0 });
    if (instrument.output) {
      instrument.output.connect(this.bus);
      this.bus.connect(master.mix);
      if (meta.reverb > 0) {
        const send = new GainNode(ctx, { gain: meta.reverb });
        this.bus.connect(send).connect(master.reverbIn);
      }
    }
    instrument.setEvolution?.(core.evolution);
    instrument.setTempo?.(core.bpm);
  }

  setOn(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    if (on && !this.active) {
      this.active = true;
      this.instrument.activate?.(this.core.ctx.currentTime);
    }
    if (!on) this.offAt = this.core.ctx.currentTime + SILENT_AFTER;
    this.apply(on ? FADE_IN : FADE_OUT);
  }

  setVolume(v: number): void {
    this.volume = v;
    this.apply(VOLUME_MOVE);
  }

  private apply(timeConstant: number): void {
    if (this.instrument.setLevel) {
      this.instrument.setLevel(this.on ? this.volume : 0);
      return;
    }
    const target = this.on ? volumeToGain(this.volume) * this.meta.level : 0;
    glide(this.core.ctx, this.bus.gain, target, timeConstant);
  }

  step(s: StepInfo): void {
    if (!this.active) return;
    if (!this.on && this.core.ctx.currentTime > this.offAt) {
      this.active = false;
      this.instrument.deactivate?.();
      return;
    }
    this.instrument.step?.(s);
  }
}
