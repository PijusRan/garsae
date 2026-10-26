// Atmosphere: vinyl crackle, wind / air, room hum.
import { movementDepth } from '../evolution';
import { glide, percussive } from '../params';
import { chance, rand } from '../random';
import { startLoop } from '../noise';
import { midiToFreq, placeInRange } from '../theory';
import type { Core, Instrument } from '../types';

const crackleCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Sparse random clicks over a faint hiss. Long enough that the loop is not noticeable. */
function crackleBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = crackleCache.get(ctx);
  if (buf) return buf;
  const sr = ctx.sampleRate;
  buf = ctx.createBuffer(2, Math.floor(sr * 9.7), sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let hiss = 0;
    for (let i = 0; i < d.length; i++) {
      hiss = hiss * 0.6 + (Math.random() * 2 - 1) * 0.4;
      d[i] = hiss * 0.012;
    }
    const clicks = Math.floor(9.7 * 55);
    for (let k = 0; k < clicks; k++) {
      const at = Math.floor(Math.random() * (d.length - 40));
      const amp = Math.pow(Math.random(), 2) * 0.32 + 0.03;
      const len = 2 + Math.floor(Math.random() * 14);
      const sign = Math.random() < 0.5 ? -1 : 1;
      for (let j = 0; j < len; j++) d[at + j] += sign * amp * Math.exp(-j / (len / 3)) * (Math.random() * 0.6 + 0.4);
    }
  }
  crackleCache.set(ctx, buf);
  return buf;
}

export function createCrackle(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const hp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 500 });
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 8000 });
  hp.connect(lp).connect(out);
  let src: AudioBufferSourceNode | undefined;

  return {
    output: out,
    activate(t) {
      src = new AudioBufferSourceNode(ctx, { buffer: crackleBuffer(ctx), loop: true });
      src.connect(hp);
      startLoop(src, t);
    },
    deactivate() {
      src?.stop();
      src?.disconnect();
      src = undefined;
    },
    step(s) {
      // Occasional bigger pops on top of the loop keep it from ever repeating.
      if (!chance(0.012)) return;
      const t = s.time + rand(0, s.stepDur);
      const n = new AudioBufferSourceNode(ctx, { buffer: core.noise.hit });
      const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: rand(1200, 3500), Q: 0.8 });
      const g = new GainNode(ctx, { gain: 0 });
      n.connect(bp).connect(g).connect(hp);
      const end = percussive(g.gain, t, rand(0.2, 0.6), 0.001, rand(0.01, 0.03));
      n.start(t, rand(0, 1.5));
      n.stop(end);
      n.onended = () => {
        n.disconnect();
        bp.disconnect();
        g.disconnect();
      };
    },
  };
}

export function createWind(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const band = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 600, Q: 1.1 });
  const air = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 3000 });
  const airGain = new GainNode(ctx, { gain: 0.12 });
  const swell = new GainNode(ctx, { gain: 0.8 });
  band.connect(swell).connect(out);
  air.connect(airGain).connect(swell);
  let src: AudioBufferSourceNode | undefined;

  function gust(barDur: number, e: number) {
    const m = movementDepth(e);
    glide(ctx, band.frequency, rand(450, 450 + 900 * m), barDur * 0.7);
    glide(ctx, band.Q, rand(0.7, 0.7 + 1.5 * m), barDur * 0.7);
    glide(ctx, swell.gain, rand(1 - 0.6 * m, 1), barDur * 0.5);
  }

  return {
    output: out,
    activate(t) {
      src = core.noise.loop('pink');
      src.connect(band);
      src.connect(air);
      startLoop(src, t);
    },
    deactivate() {
      src?.stop();
      src?.disconnect();
      src = undefined;
    },
    step(s) {
      if (s.stepInBar === 0 && (s.bar % 2 === 0 || chance(s.evolution))) gust(s.barDur, s.evolution);
    },
  };
}

export function createHum(core: Core): Instrument {
  const { ctx } = core;
  const out = new GainNode(ctx, { gain: 1 });
  const rumbleLp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 230, Q: 0.7 });
  const rumbleGain = new GainNode(ctx, { gain: 0.9 });
  const humGain = new GainNode(ctx, { gain: 0.8 });
  const wobble = new OscillatorNode(ctx, { frequency: 0.13 });
  const wobbleDepth = new GainNode(ctx, { gain: 0.15 });
  wobble.connect(wobbleDepth).connect(humGain.gain);
  wobble.start();
  rumbleLp.connect(rumbleGain).connect(out);
  humGain.connect(out);
  const partials = [
    { mult: 1, gain: 0.12 },
    { mult: 2, gain: 0.05 },
    { mult: 3, gain: 0.018 },
  ];
  let oscs: { osc: OscillatorNode; mult: number }[] = [];
  let nodes: AudioNode[] = [];
  let src: AudioBufferSourceNode | undefined;

  // The hum is tuned to the key root so it never beats against the music.
  const humFreq = (root: number) => midiToFreq(placeInRange(root, 31));

  return {
    output: out,
    activate(t) {
      src = core.noise.loop('brown');
      src.connect(rumbleLp);
      startLoop(src, t);
      const f = humFreq(core.root);
      for (const p of partials) {
        const osc = new OscillatorNode(ctx, { frequency: f * p.mult });
        const g = new GainNode(ctx, { gain: p.gain });
        osc.connect(g).connect(humGain);
        osc.start(t);
        oscs.push({ osc, mult: p.mult });
        nodes.push(g);
      }
    },
    deactivate() {
      src?.stop();
      src?.disconnect();
      src = undefined;
      for (const { osc } of oscs) {
        osc.stop();
        osc.disconnect();
      }
      for (const n of nodes) n.disconnect();
      oscs = [];
      nodes = [];
    },
    setKey(root) {
      const f = humFreq(root);
      for (const { osc, mult } of oscs) glide(ctx, osc.frequency, f * mult, 1.5);
    },
  };
}
