import type { TileMeta } from '../tiles';
import { glide, volumeToGain } from './params';
import type { Core, Instrument, StepInfo } from './types';

/** Fade time constants (seconds). Gentle: tiles never pop in or out. */
const FADE_IN = 0.9;
const FADE_OUT = 0.7;
const VOLUME_MOVE = 0.15;
/** While paused nothing is heard, so changes land at once; Play's master fade brings them in. */
const AT_ONCE = 0.001;
/** After this long a faded-out tile stops scheduling and releases its sources. */
const SILENT_AFTER = 5;

/**
 * Wraps one instrument with its gain bus and reverb send.
 * Toggling fades the bus instead of cancelling notes already scheduled.
 */
export class Tile {
  on = false;
  volume: number;
  /** This tile's own Evolution, or null to follow the mix's. */
  ownEvolution: number | null = null;
  private active = false;
  private offAt = 0;
  private bus: GainNode;
  private analyser: AnalyserNode | null = null;

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

  /** The Evolution this tile plays with. */
  get evolution(): number {
    return this.ownEvolution ?? this.core.evolution;
  }

  /** null hands the tile back to the mix's Evolution. */
  setOwnEvolution(e: number | null): void {
    if (e === this.ownEvolution) return;
    this.ownEvolution = e;
    this.instrument.setEvolution?.(this.evolution);
  }

  /** The mix's Evolution moved: only tiles that follow it hear about it. */
  mixEvolutionChanged(): void {
    if (this.ownEvolution === null) this.instrument.setEvolution?.(this.core.evolution);
  }

  /** A tap on this tile's sound after its level, for the UI to draw. Made on first use; effect tiles have none. */
  get meter(): AnalyserNode | null {
    if (!this.analyser && this.instrument.output) {
      this.analyser = new AnalyserNode(this.core.ctx, {
        fftSize: 256,
        smoothingTimeConstant: 0.85,
        minDecibels: -85,
        maxDecibels: -20,
      });
      this.bus.connect(this.analyser);
    }
    return this.analyser;
  }

  /** `atOnce` skips the fade: used while paused, when the audio clock is stopped and a fade would wait for Play. */
  setOn(on: boolean, atOnce = false): void {
    if (on === this.on) return;
    this.on = on;
    if (on && !this.active) {
      this.active = true;
      this.instrument.activate?.(this.core.ctx.currentTime);
    }
    if (!on) this.offAt = this.core.ctx.currentTime + SILENT_AFTER;
    this.apply(atOnce ? AT_ONCE : on ? FADE_IN : FADE_OUT);
  }

  setVolume(v: number, atOnce = false): void {
    if (v === this.volume) return;
    this.volume = v;
    this.apply(atOnce ? AT_ONCE : VOLUME_MOVE);
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
    if (!this.on) {
      // A tile that is off starts no new notes: the ones already sounding fade with the bus. Otherwise an
      // old drum kit and bass keep hitting under the new mix (a doubled downbeat) until they are released.
      if (this.core.ctx.currentTime > this.offAt) {
        this.active = false;
        this.instrument.deactivate?.();
      }
      return;
    }
    this.instrument.step?.(this.ownEvolution === null ? s : { ...s, evolution: this.ownEvolution });
  }
}
