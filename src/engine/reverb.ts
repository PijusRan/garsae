// A generated stereo impulse response: decaying noise that darkens over time,
// like a soft, large room. No samples needed.

export function createImpulse(ctx: BaseAudioContext, seconds = 4.2, decay = 3.2): AudioBuffer {
  const sr = ctx.sampleRate;
  const length = Math.floor(sr * seconds);
  const preDelay = Math.floor(sr * 0.025);
  const buf = ctx.createBuffer(2, length, sr);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    let lp = 0;
    for (let i = preDelay; i < length; i++) {
      const t = (i - preDelay) / (length - preDelay);
      // Damping grows over time: high frequencies die first.
      const coeff = 0.15 + 0.8 * t;
      lp = lp * coeff + (Math.random() * 2 - 1) * (1 - coeff);
      const env = Math.pow(1 - t, decay);
      // Soft onset avoids a sharp early reflection.
      const onset = Math.min(1, (i - preDelay) / (sr * 0.06));
      data[i] = lp * env * onset;
    }
  }
  // Normalise energy so the wet level is predictable.
  let sq = 0;
  for (let c = 0; c < 2; c++) for (const v of buf.getChannelData(c)) sq += v * v;
  const scale = 1 / Math.sqrt(sq / 2);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] *= scale * 0.9;
  }
  return buf;
}
