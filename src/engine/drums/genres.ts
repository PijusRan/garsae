// Drum genres. Each genre is its own tile with its own volume, and several can layer.
import { drumMutationChance, drumMutationInterval, drumMutationSize } from '../evolution';
import { glide } from '../params';
import { chance, rand } from '../random';
import type { Core, Instrument, StepInfo } from '../types';
import {
  freshSlices,
  makeTracks,
  mutateOnce,
  mutateSlices,
  parsePattern,
  sliceSource,
  type Track,
  type TrackDef,
} from './patterns';
import { playHit, type Kit, type Voice } from './voices';

interface Chain {
  input: AudioNode;
  output: AudioNode;
  echo?: AudioNode;
  setTempo?(bpm: number): void;
}

function saturationCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 1025;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(drive * x) / Math.tanh(drive);
  }
  return c;
}

interface GenreDef {
  tracks: TrackDef[];
  /** Fraction of a 16th that off-beat 16ths are delayed by. */
  swing: number;
  /** Random timing spread in seconds. */
  humanize: number;
  /** 4-step fills that may replace the last beat of a 4-bar phrase. */
  fills: { voice: Voice; pattern: string; opts?: TrackDef['opts'] }[];
  chain(ctx: BaseAudioContext): Chain;
}

const GENRES: Record<'lofi' | 'techno' | 'dub' | 'ambient', GenreDef> = {
  // Lo-fi hip hop: lazy boom-bap, heavy swing, dusty and darkened.
  lofi: {
    swing: 0.2,
    humanize: 0.007,
    tracks: [
      { voice: 'kick', pattern: 'X.....x...x.....', core: true, opts: { tone: 0.9, decay: 1.1 } },
      { voice: 'snare', pattern: '....X.......X...', core: true, gain: 0.85, opts: { decay: 1.2 } },
      { voice: 'snare', pattern: '.......g......g.', gain: 0.6 },
      { voice: 'hat', pattern: 'x.o.x.o.x.o.x.oo', gain: 0.75 },
    ],
    fills: [{ voice: 'snare', pattern: 'g.gg', opts: { decay: 0.8 } }],
    chain(ctx) {
      const input = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 35 });
      const sat = new WaveShaperNode(ctx, { curve: saturationCurve(1.6), oversample: '2x' });
      const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 4000, Q: 0.4 });
      const output = new GainNode(ctx, { gain: 0.8 });
      input.connect(sat).connect(lp).connect(output);
      return { input, output };
    },
  },

  // Minimal techno / house: four on the floor, offbeat hats, sparse percussion.
  techno: {
    swing: 0.04,
    humanize: 0.002,
    tracks: [
      { voice: 'kick', pattern: 'X...X...X...X...', core: true, opts: { tone: 1, decay: 0.9 } },
      { voice: 'clap', pattern: '....x.......x...', core: true, gain: 0.55 },
      { voice: 'openhat', pattern: '..o...o...o...o.', gain: 0.8 },
      { voice: 'hat', pattern: '.g.g.g.g.g.g.g.g', gain: 0.8 },
      { voice: 'rim', pattern: '......o......o..', gain: 0.5 },
    ],
    fills: [{ voice: 'rim', pattern: 'o.oo' }],
    chain(ctx) {
      const input = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 30 });
      const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 9000 });
      const output = new GainNode(ctx, { gain: 0.8 });
      input.connect(lp).connect(output);
      return { input, output };
    },
  },

  // Dub / downtempo: one-drop (kick and rim together on beat 3) with a dub echo.
  dub: {
    swing: 0.12,
    humanize: 0.005,
    tracks: [
      { voice: 'kick', pattern: '........X.......', core: true, opts: { tone: 0.85, decay: 1.3 } },
      { voice: 'rim', pattern: '........x.......', core: true, gain: 0.8, echo: true },
      { voice: 'hat', pattern: 'o.g.o.g.o.g.o.g.', gain: 0.7 },
      { voice: 'rim', pattern: '..............g.', gain: 0.6, echo: true },
      { voice: 'tom', pattern: '................', gain: 0.6, opts: { tone: 0.8 } },
    ],
    fills: [{ voice: 'tom', pattern: '.o.o', opts: { tone: 0.8 } }],
    chain(ctx) {
      const input = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 6000 });
      const output = new GainNode(ctx, { gain: 0.85 });
      input.connect(output);
      const echo = new GainNode(ctx, { gain: 0.6 });
      const delay = new DelayNode(ctx, { maxDelayTime: 2, delayTime: 0.5 });
      const loop = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 1300, Q: 0.6 });
      const feedback = new GainNode(ctx, { gain: 0.5 });
      const wet = new GainNode(ctx, { gain: 0.55 });
      echo.connect(delay).connect(loop).connect(feedback).connect(delay);
      loop.connect(wet).connect(output);
      return {
        input,
        output,
        echo,
        setTempo(bpm) {
          glide(ctx, delay.delayTime, (60 / bpm) * 0.75, 0.5);
        },
      };
    },
  },

  // Ambient pulse: a soft heartbeat. A muffled low thump on beats 1 and 3,
  // a breathy shaker on the eighths and an occasional soft tom. No snare.
  ambient: {
    swing: 0.08,
    humanize: 0.006,
    tracks: [
      { voice: 'kick', pattern: 'X.......x.......', core: true, opts: { tone: 0.75, decay: 1.5 } },
      { voice: 'shaker', pattern: 'o.g.o.g.o.g.o.g.', gain: 0.7, opts: { decay: 1.6 } },
      { voice: 'tom', pattern: '..........g.....', gain: 0.5, opts: { tone: 0.7, decay: 1.4 } },
    ],
    fills: [{ voice: 'tom', pattern: '..g.', opts: { tone: 0.6 } }],
    chain(ctx) {
      const input = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1100, Q: 0.5 });
      const output = new GainNode(ctx, { gain: 1.3 });
      input.connect(output);
      return { input, output };
    },
  },
};

function swingOffset(stepInBar: number, stepDur: number, swing: number): number {
  return stepInBar % 2 === 1 ? swing * stepDur : 0;
}

function createPatternGenre(def: GenreDef) {
  return (core: Core): Instrument => {
    const { ctx } = core;
    const kit: Kit = { ctx, noise: core.noise };
    const chain = def.chain(ctx);
    const tracks: Track[] = makeTracks(def.tracks);
    const fills = def.fills.map((f) => ({ ...f, steps: parsePattern(f.pattern) }));
    let fillThisBar = false;

    function onBar(s: StepInfo) {
      const e = s.evolution;
      if (s.bar % drumMutationInterval(e) === 0 && chance(drumMutationChance(e))) {
        const n = drumMutationSize(e);
        for (let i = 0; i < n; i++) mutateOnce(tracks);
      }
      // A small fill on the last bar of a 4-bar phrase.
      fillThisBar = s.bar % 4 === 3 && chance(0.45 * drumMutationChance(e));
    }

    return {
      output: chain.output,
      setTempo: chain.setTempo,
      step(s) {
        if (s.stepInBar === 0) onBar(s);
        const t = s.time + swingOffset(s.stepInBar, s.stepDur, def.swing);
        for (const tr of tracks) {
          const vel = tr.cur[s.stepInBar];
          if (vel <= 0) continue;
          const at = Math.max(s.time, t + rand(-def.humanize, def.humanize));
          const v = vel * (tr.def.gain ?? 1) * rand(0.92, 1.05);
          playHit(kit, tr.def.voice, chain.input, at, v, tr.def.opts);
          if (tr.def.echo && chain.echo) playHit(kit, tr.def.voice, chain.echo, at, v, tr.def.opts);
        }
        if (fillThisBar && s.stepInBar >= 12) {
          for (const f of fills) {
            const vel = f.steps[s.stepInBar - 12];
            if (vel > 0) playHit(kit, f.voice, chain.input, t, vel * 0.8, f.opts);
          }
        }
      },
    };
  };
}

export const createLofi = createPatternGenre(GENRES.lofi);
export const createTechno = createPatternGenre(GENRES.techno);
export const createDub = createPatternGenre(GENRES.dub);
export const createAmbientPulse = createPatternGenre(GENRES.ambient);

// ---------------------------------------------------------------- breakbeat

/** A two-bar, amen-flavoured break: busy, authentic, never thinned automatically. */
const BREAK: TrackDef[] = [
  { voice: 'kick', pattern: 'X.X.......xX....' + 'X.X.......X.....', opts: { tone: 1.05, decay: 0.8 } },
  { voice: 'snare', pattern: '....X..o.og.X..o' + '....X..o.o..g.X.', opts: { tone: 1.1 } },
  { voice: 'ride', pattern: 'x.o.x.o.x.o.x.o.' + 'x.o.x.o.x.o.x.o.' },
  { voice: 'hat', pattern: '.g.g.g.g.g.g.g.g' + '.g.g.g.g.g.g.g.g', gain: 0.6 },
];

export function createBreakbeat(core: Core): Instrument {
  const { ctx } = core;
  const kit: Kit = { ctx, noise: core.noise };
  const tracks = makeTracks(BREAK);
  const slices = freshSlices(8);
  const input = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 60 });
  const sat = new WaveShaperNode(ctx, { curve: saturationCurve(1.4), oversample: '2x' });
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 6500, Q: 0.4 });
  const output = new GainNode(ctx, { gain: 0.75 });
  input.connect(sat).connect(lp).connect(output);

  return {
    output,
    step(s) {
      const pos = (s.bar % 2) * 16 + s.stepInBar;
      if (pos === 0) {
        const e = s.evolution;
        // Mutates more freely than other genres, but Evolution still scales it.
        if (e > 0 && chance(0.35 + 0.65 * e)) {
          const ops = 1 + Math.floor(rand(0, 1.5 + 3 * e));
          for (let i = 0; i < ops; i++) mutateSlices(slices);
        }
      }
      const src = sliceSource(slices, pos);
      const t = s.time + swingOffset(s.stepInBar, s.stepDur, 0.06);
      for (const tr of tracks) {
        const vel = tr.cur[src];
        if (vel <= 0) continue;
        playHit(kit, tr.def.voice, input, Math.max(s.time, t + rand(-0.003, 0.003)), vel * (tr.def.gain ?? 1), tr.def.opts);
      }
    },
  };
}
