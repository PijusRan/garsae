// A generated stereo impulse response, built the way a real room behaves. No samples needed.
//   early reflections: distinct first bounces off the walls, different on each side
//   late tail: dense noise split into bands, each dying at its own rate, so the highs go first

/** Decay time (seconds to fall 60 dB) per band. Air and soft furnishings take the top end quickly. */
const BANDS = [
  { hz: 300, t60: 2.1 },
  { hz: 1200, t60: 1.9 },
  { hz: 4000, t60: 1.3 },
  { hz: 12000, t60: 0.7 },
];

/** First bounces, in seconds, with their levels. Unevenly spaced: regular ones ring like a metal box. */
const REFLECTIONS = [
  [0.011, 0.9],
  [0.017, 0.75],
  [0.023, 0.8],
  [0.031, 0.6],
  [0.037, 0.65],
  [0.047, 0.5],
  [0.059, 0.45],
  [0.071, 0.35],
];

export function createImpulse(ctx: BaseAudioContext, seconds = 3): AudioBuffer {
  const sr = ctx.sampleRate;
  const length = Math.floor(sr * seconds);
  const preDelay = Math.floor(sr * 0.018);
  const buf = ctx.createBuffer(2, length, sr);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    let previous = 0;
    // Each band is noise below its corner minus what the band under it took, each with its own decay.
    for (const { hz, t60 } of BANDS) {
      const a = 1 - Math.exp((-2 * Math.PI * hz) / sr);
      let low = 0;
      let lowBelow = 0;
      const below = previous ? 1 - Math.exp((-2 * Math.PI * previous) / sr) : 0;
      const fall = Math.exp(-6.91 / (t60 * sr));
      let env = 1;
      for (let i = preDelay; i < length; i++) {
        const w = Math.random() * 2 - 1;
        low += (w - low) * a;
        lowBelow += (w - lowBelow) * below;
        data[i] += (low - lowBelow) * env;
        env *= fall;
      }
      previous = hz;
    }
    // The tail builds up over the first few tens of milliseconds, as a room's does.
    const onset = sr * 0.05;
    for (let i = preDelay; i < length; i++) {
      const x = (i - preDelay) / onset;
      if (x >= 1) break;
      data[i] *= x * x;
    }
  }
  // Normalise the tail, then set the reflections against it.
  let sq = 0;
  for (let c = 0; c < 2; c++) for (const v of buf.getChannelData(c)) sq += v * v;
  const scale = 0.9 / Math.sqrt(sq / 2);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] *= scale;
    for (const [time, level] of REFLECTIONS) {
      // Each side hears the same bounce a little earlier or later, and sometimes inverted.
      const at = preDelay + Math.floor(sr * time * (c === 0 ? 1 : 1.13));
      const sign = (Math.floor(time * 1000) + c) % 2 === 0 ? 1 : -1;
      data[at] += sign * level * 0.012;
      data[at + 1] += sign * level * 0.008;
    }
  }
  return buf;
}
