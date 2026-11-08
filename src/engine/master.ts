// Master chain:
//   tile buses -> mix -> wobble (modulated delay) -> amplitude modulation -> output fade
//     -> subsonic filter -> mono bass -> tone -> glue -> makeup -> limiter -> soft clip -> volume -> speakers
//   reverb sends -> convolver -> mix
// Aims for about -17 LUFS on a typical mix with peaks under -1 dBTP, however much is switched on (see `npm run smoke`).
// Wobble and amplitude modulation are parameters, so a later "focus profile"
// can drive them as a preset layer without a rewrite.
import { glide, volumeToGain } from './params';
import { createImpulse } from './reverb';

/** The loudest a sample may be: -1 dBFS. Streaming masters use the same ceiling, to leave room between samples. */
const CEILING = 10 ** (-1 / 20);
/** Below this the soft clip leaves the signal alone. */
const CLIP_KNEE = 0.72;

/**
 * Transparent up to the knee, then rounding off into the ceiling. Nothing passes it, whatever comes in.
 * The curve covers inputs up to 2, so it is driven at half level and made up afterwards.
 */
function softClipCurve(): Float32Array<ArrayBuffer> {
  const n = 4097;
  const curve = new Float32Array(n);
  const range = CEILING - CLIP_KNEE;
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * 2;
    const a = Math.abs(x);
    const y = a <= CLIP_KNEE ? a : CLIP_KNEE + range * Math.tanh((a - CLIP_KNEE) / range);
    curve[i] = (Math.sign(x) * y) / 2;
  }
  return curve;
}

/**
 * Keeps everything below `freq` in the middle, so bass stays solid on mono speakers and the limiter isn't pushed
 * by low end on one side. A Linkwitz-Riley crossover: the highs of each side add back to the mono lows with no
 * change in level, and both channels get the same phase shift, so the stereo image above the crossover is untouched.
 */
function monoBass(ctx: BaseAudioContext, freq: number): { input: AudioNode; output: AudioNode } {
  const input = new GainNode(ctx, { channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers' });
  const split = new ChannelSplitterNode(ctx, { numberOfOutputs: 2 });
  const merge = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
  input.connect(split);
  const Q = Math.SQRT1_2;
  const twoPole = (type: BiquadFilterType, from: AudioNode, fromOutput = 0): AudioNode => {
    const a = new BiquadFilterNode(ctx, { type, frequency: freq, Q });
    const b = new BiquadFilterNode(ctx, { type, frequency: freq, Q });
    from.connect(a, fromOutput);
    return a.connect(b);
  };
  const mid = new GainNode(ctx, { gain: 0.5 });
  split.connect(mid, 0);
  split.connect(mid, 1);
  const lows = twoPole('lowpass', mid);
  for (const side of [0, 1]) {
    twoPole('highpass', split, side).connect(merge, 0, side);
    lows.connect(merge, 0, side);
  }
  return { input, output: merge };
}

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
  /** The listener's master volume. After the limiter, so it never changes how the mix is limited. */
  readonly volume: GainNode;

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
    // Rumble nobody hears only uses up headroom.
    const subsonic = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 24, Q: 0.7 });
    const mono = monoBass(ctx, 120);
    // A broad, shallow tone: a little less low-mid mud, a little more air.
    const mud = new BiquadFilterNode(ctx, { type: 'peaking', frequency: 320, Q: 0.8, gain: -1 });
    const air = new BiquadFilterNode(ctx, { type: 'highshelf', frequency: 9000, gain: 1.2 });
    // Glue: so slow and shallow that a kick drum can't move it. Fast compression here makes pads duck on every beat.
    const glue = new DynamicsCompressorNode(ctx, { threshold: -22, knee: 20, ratio: 1.5, attack: 0.08, release: 0.8 });
    const makeup = new GainNode(ctx, { gain: 2 });
    // Only for the odd peak. If this works on every kick, the mix is wrong, not the limiter.
    this.limiter = new DynamicsCompressorNode(ctx, {
      threshold: -2,
      knee: 2,
      ratio: 20,
      attack: 0.001,
      release: 0.09,
    });
    const clipIn = new GainNode(ctx, { gain: 0.5 });
    const clip = new WaveShaperNode(ctx, { curve: softClipCurve(), oversample: '4x' });
    const clipOut = new GainNode(ctx, { gain: 2 });

    this.mix.connect(this.wobble).connect(this.amGain).connect(this.output).connect(subsonic).connect(mono.input);
    mono.output.connect(mud).connect(air).connect(glue).connect(makeup).connect(this.limiter);
    this.limiter.connect(clipIn).connect(clip).connect(clipOut);
    this.volume = new GainNode(ctx, { gain: 1 });
    clipOut.connect(this.volume).connect(ctx.destination);

    this.sources = [wow, flutter, this.amLfo];
    for (const s of this.sources) s.start();
  }

  /** Fades the whole app in or out. */
  setOutput(level: number, timeConstant = 0.4): void {
    glide(this.ctx, this.output.gain, level, timeConstant);
  }

  /** Master volume, 0-1 slider position. */
  setVolume(v: number): void {
    glide(this.ctx, this.volume.gain, volumeToGain(Math.min(1, Math.max(0, v))), 0.08);
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
