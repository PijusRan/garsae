// The tape flute's voice: a near-sine with soft harmonics, breath noise, a late vibrato and tape wow. Chosen in
// compare round 6 over a jet-driven waveguide model and a warm additive one.
import { cleanupAt } from '../params';
import { startLoop } from '../noise';
import { rand } from '../random';
import { midiToFreq } from '../theory';
import type { Core } from '../types';
import type { ModelVoice } from '../models/host';

/** Tape flute: a near-sine with soft harmonics, breath noise, a late vibrato and tape wow. */
export function synthFlute(core: Core, dest: AudioNode): ModelVoice {
  const { ctx } = core;
  const vibrato = new OscillatorNode(ctx, { frequency: 4.7 });
  const wow = new OscillatorNode(ctx, { frequency: 0.55 });
  const wowDepth = new GainNode(ctx, { gain: 5 });
  wow.connect(wowDepth);
  vibrato.start();
  wow.start();
  return {
    output: dest,
    note(t, midi, hold, vel) {
      const f = midiToFreq(midi);
      const amp = new GainNode(ctx, { gain: 0 });
      const pan = new StereoPannerNode(ctx, { pan: rand(-0.2, 0.2) });
      amp.connect(pan).connect(dest);
      const vibDepth = new GainNode(ctx, { gain: 0 });
      vibrato.connect(vibDepth);
      vibDepth.gain.setValueAtTime(0, t + 0.4);
      vibDepth.gain.linearRampToValueAtTime(8, t + 1.2);
      const oscs = [
        { ratio: 1, gain: 1 },
        { ratio: 2, gain: 0.16 },
        { ratio: 3, gain: 0.05 },
      ].map((p) => {
        const o = new OscillatorNode(ctx, { frequency: f * p.ratio });
        const g = new GainNode(ctx, { gain: p.gain });
        o.connect(g).connect(amp);
        vibDepth.connect(o.detune);
        wowDepth.connect(o.detune);
        return { o, g };
      });
      const breath = new AudioBufferSourceNode(ctx, { buffer: core.noise.get('pink'), loop: true });
      const breathBp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: f * 2, Q: 1.1 });
      const breathGain = new GainNode(ctx, { gain: 0 });
      breathGain.gain.setValueAtTime(0, t);
      breathGain.gain.linearRampToValueAtTime(0.5, t + 0.06);
      breathGain.gain.setTargetAtTime(0.18, t + 0.06, 0.15);
      breath.connect(breathBp).connect(breathGain).connect(amp);
      const peak = 0.1 * vel;
      const attack = 0.2;
      const relStart = t + Math.max(attack + 0.1, hold);
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(peak * 0.8, t + attack);
      amp.gain.linearRampToValueAtTime(peak, t + attack + (relStart - t - attack) * 0.4);
      amp.gain.linearRampToValueAtTime(peak * 0.7, relStart);
      amp.gain.setTargetAtTime(0, relStart, 0.12);
      for (const { o } of oscs) o.start(t);
      startLoop(breath, t);
      const sources = oscs.map((x) => x.o);
      cleanupAt([...sources, breath], relStart + 0.7, [amp, pan, vibDepth, breathBp, breathGain, ...oscs.map((x) => x.g)], () => {
        vibrato.disconnect(vibDepth);
        for (const o of sources) wowDepth.disconnect(o.detune);
      });
    },
  };
}
