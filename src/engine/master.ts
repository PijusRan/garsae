// Master chain:
//   tile buses -> mix -> wobble (modulated delay) -> amplitude modulation -> output fade -> limiter -> speakers
//   reverb sends -> convolver -> mix
// Wobble and amplitude modulation are parameters, so a later "focus profile"
// can drive them as a preset layer without a rewrite.
import { glide } from './params';
import { createImpulse } from './reverb';

export interface ModulationSettings {
  /** Modulation rate in Hz (beta range is ~12-20). */
  rate: number;
  /** 0 = off, 1 = full dips to silence. Keep it low; 0.3 is already strong. */
  depth: number;
}

export class Master {
  readonly mix: GainNode;
  readonly reverbIn: GainNode;
  readonly output: GainNode;
  readonly limiter: DynamicsCompressorNode;

  private amGain: GainNode;
  private amLfo: OscillatorNode;
  private amDepth: GainNode;
  private wobble: DelayNode;
  private wowDepth: GainNode;
  private flutterDepth: GainNode;
  private sources: OscillatorNode[] = [];

  constructor(private ctx: BaseAudioContext) {
    this.mix = new GainNode(ctx, { gain: 0.8 });
    this.reverbIn = new GainNode(ctx, { gain: 1 });
    const convolver = new ConvolverNode(ctx, { buffer: createImpulse(ctx) });
    const reverbHp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 180 });
    const reverbReturn = new GainNode(ctx, { gain: 0.55 });
    this.reverbIn.connect(reverbHp).connect(convolver).connect(reverbReturn).connect(this.mix);

    // Tape wobble: a short delay whose time is gently modulated (wow + flutter).
    this.wobble = new DelayNode(ctx, { maxDelayTime: 0.05, delayTime: 0.012 });
    const wow = new OscillatorNode(ctx, { frequency: 0.45 });
    const flutter = new OscillatorNode(ctx, { frequency: 5.3 });
    this.wowDepth = new GainNode(ctx, { gain: 0 });
    this.flutterDepth = new GainNode(ctx, { gain: 0 });
    wow.connect(this.wowDepth).connect(this.wobble.delayTime);
    flutter.connect(this.flutterDepth).connect(this.wobble.delayTime);

    // Amplitude modulation: gain = (1 - depth/2) + (depth/2) * sin(2π·rate·t).
    this.amGain = new GainNode(ctx, { gain: 1 });
    this.amLfo = new OscillatorNode(ctx, { frequency: 16 });
    this.amDepth = new GainNode(ctx, { gain: 0 });
    this.amLfo.connect(this.amDepth).connect(this.amGain.gain);

    this.output = new GainNode(ctx, { gain: 0 });
    this.limiter = new DynamicsCompressorNode(ctx, {
      threshold: -6,
      knee: 0,
      ratio: 20,
      attack: 0.003,
      release: 0.25,
    });

    this.mix.connect(this.wobble).connect(this.amGain).connect(this.output).connect(this.limiter);
    this.limiter.connect(ctx.destination);

    this.sources = [wow, flutter, this.amLfo];
    for (const s of this.sources) s.start();
  }

  /** Fades the whole app in or out. */
  setOutput(level: number, timeConstant = 0.4): void {
    glide(this.ctx, this.output.gain, level, timeConstant);
  }

  /** Amplitude modulation applied to the mix (the AM tile, and later the Focus feature). */
  setModulation({ rate, depth }: ModulationSettings): void {
    const d = Math.min(1, Math.max(0, depth));
    glide(this.ctx, this.amLfo.frequency, rate, 0.5);
    glide(this.ctx, this.amDepth.gain, d / 2, 0.5);
    glide(this.ctx, this.amGain.gain, 1 - d / 2, 0.5);
  }

  /** Tape wobble amount, 0-1. */
  setWobble(amount: number): void {
    const a = Math.min(1, Math.max(0, amount));
    glide(this.ctx, this.wowDepth.gain, a * 0.0035, 0.6);
    glide(this.ctx, this.flutterDepth.gain, a * 0.00012, 0.6);
  }
}
