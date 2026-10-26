// Noise generators. Buffers are made once per colour and looped.
// The loop seam is crossfaded so even brown noise never clicks when it wraps.

export type NoiseColor = 'white' | 'pink' | 'brown';

function generator(color: NoiseColor): () => number {
  if (color === 'white') return () => Math.random() * 2 - 1;
  if (color === 'brown') {
    let last = 0;
    return () => {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      return last * 3.5;
    };
  }
  // Paul Kellet's refined pink noise filter.
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  return () => {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    const out = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
    return out * 0.11;
  };
}

/** Fills a channel with seamlessly loopable noise normalised to the given RMS. */
function fillLoopable(data: Float32Array, color: NoiseColor, sampleRate: number, rms: number): void {
  const n = data.length;
  const fade = Math.min(Math.floor(sampleRate * 0.5), Math.floor(n / 4));
  const gen = generator(color);
  // Warm up the filter state so the start isn't a transient.
  for (let i = 0; i < sampleRate; i++) gen();
  for (let i = 0; i < n; i++) data[i] = gen();
  // Continue generating past the end and crossfade that tail into the start.
  for (let i = 0; i < fade; i++) {
    const tail = gen();
    const x = i / fade;
    const fadeIn = Math.sin((x * Math.PI) / 2);
    const fadeOut = Math.cos((x * Math.PI) / 2);
    data[i] = data[i] * fadeIn + tail * fadeOut;
  }
  // Remove DC (matters for brown noise) and normalise.
  let mean = 0;
  for (let i = 0; i < n; i++) mean += data[i];
  mean /= n;
  let sq = 0;
  for (let i = 0; i < n; i++) {
    data[i] -= mean;
    sq += data[i] * data[i];
  }
  const scale = rms / Math.sqrt(sq / n || 1);
  for (let i = 0; i < n; i++) data[i] *= scale;
}

export class NoiseBank {
  private cache = new Map<string, AudioBuffer>();

  constructor(private ctx: BaseAudioContext) {}

  /** A stereo (decorrelated) or mono noise buffer, about `seconds` long. */
  get(color: NoiseColor, seconds = 12, stereo = true): AudioBuffer {
    const key = `${color}:${seconds}:${stereo}`;
    let buf = this.cache.get(key);
    if (!buf) {
      const sr = this.ctx.sampleRate;
      buf = this.ctx.createBuffer(stereo ? 2 : 1, Math.floor(sr * seconds), sr);
      for (let c = 0; c < buf.numberOfChannels; c++) fillLoopable(buf.getChannelData(c), color, sr, 0.25);
      this.cache.set(key, buf);
    }
    return buf;
  }

  /** Short mono white noise for drum hits. */
  get hit(): AudioBuffer {
    return this.get('white', 2, false);
  }

  /** A looping source starting at a random point so layers never line up. */
  loop(color: NoiseColor, seconds = 12): AudioBufferSourceNode {
    const src = new AudioBufferSourceNode(this.ctx, { buffer: this.get(color, seconds), loop: true });
    return src;
  }
}

/** Starts a looping source at a random offset. */
export function startLoop(src: AudioBufferSourceNode, when: number): void {
  const dur = src.buffer?.duration ?? 1;
  src.start(when, Math.random() * dur);
}
