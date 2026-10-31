// Drum genres. Each genre is its own tile with its own volume, and several can layer.
import { drumMutationChance, drumMutationInterval, drumMutationSize, noteDensity } from '../evolution';
import { glide } from '../params';
import { chance, clamp, rand } from '../random';
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
import { saturationCurve } from '../synth';
import { playHit, type HitOpts, type Kit, type Voice } from './voices';

interface Chain {
  input: AudioNode;
  output: AudioNode;
  echo?: AudioNode;
  setTempo?(bpm: number): void;
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

/**
 * A two-bar, amen-flavoured break as electronic music uses it: chopped, near-quantized and
 * compressed. A short punchy kick, a crisp snare, tight 16th hats with an open hat on the
 * turnaround. Never thinned automatically.
 */
const BREAK: TrackDef[] = [
  { voice: 'kick', pattern: 'X.X.......xX....' + 'X.X.......X.....', opts: { tone: 1.15, decay: 0.55 } },
  { voice: 'snare', pattern: '....X..o.og.X..o' + '....X..o.o..g.X.', opts: { tone: 1.2, decay: 0.7 } },
  { voice: 'hat', pattern: 'x.o.x.o.x.o.x.o.' + 'x.o.x.o.x.o.x...', gain: 0.85, opts: { tone: 1.05, decay: 0.7 } },
  { voice: 'hat', pattern: '.g.g.g.g.g.g.g.g' + '.g.g.g.g.g.g.g..', gain: 0.55, opts: { tone: 1.1, decay: 0.5 } },
  { voice: 'openhat', pattern: '................' + '..............o.', gain: 0.6, opts: { decay: 0.6 } },
];

export function createBreakbeat(core: Core): Instrument {
  const { ctx } = core;
  const kit: Kit = { ctx, noise: core.noise };
  const tracks = makeTracks(BREAK);
  const slices = freshSlices(8);
  // Drum-bus glue: a fast compressor for punch, then soft saturation. Bright, not darkened.
  const input = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 45 });
  const comp = new DynamicsCompressorNode(ctx, { threshold: -20, knee: 6, ratio: 4, attack: 0.002, release: 0.07 });
  const makeUp = new GainNode(ctx, { gain: 1.6 });
  const sat = new WaveShaperNode(ctx, { curve: saturationCurve(1.6), oversample: '4x' });
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 12000, Q: 0.4 });
  const output = new GainNode(ctx, { gain: 0.75 });
  input.connect(comp).connect(makeUp).connect(sat).connect(lp).connect(output);
  let rollThisBar = false;

  return {
    output,
    step(s) {
      const pos = (s.bar % 2) * 16 + s.stepInBar;
      const e = s.evolution;
      if (pos === 0) {
        // Mutates more freely than other genres, but Evolution still scales it.
        if (e > 0 && chance(0.35 + 0.65 * e)) {
          const ops = 1 + Math.floor(rand(0, 1.5 + 3 * e));
          for (let i = 0; i < ops; i++) mutateSlices(slices);
        }
      }
      // A 32nd-note snare roll may replace the snare on the last beat of a 4-bar phrase.
      if (s.stepInBar === 0) rollThisBar = s.bar % 4 === 3 && chance(0.15 + 0.4 * e);
      const rolling = rollThisBar && s.stepInBar >= 12;
      const src = sliceSource(slices, pos);
      const t = s.time + swingOffset(s.stepInBar, s.stepDur, 0.02);
      for (const tr of tracks) {
        if (rolling && tr.def.voice === 'snare') continue;
        const vel = tr.cur[src];
        if (vel <= 0) continue;
        playHit(kit, tr.def.voice, input, Math.max(s.time, t + rand(-0.001, 0.001)), vel * (tr.def.gain ?? 1), tr.def.opts);
      }
      if (rolling) {
        // Two hits per 16th, rising in level and pitch into the downbeat.
        for (let h = 0; h < 2; h++) {
          const k = (s.stepInBar - 12) * 2 + h;
          playHit(kit, 'snare', input, t + (h * s.stepDur) / 2, 0.3 + 0.07 * k, { tone: 1.15 + 0.02 * k, decay: 0.45 });
        }
      }
    },
  };
}

// ---------------------------------------------------------------- brushes (jazz)

/**
 * Swing ratio (long : short) of a jazz ride at a given tempo. Measured players swing hardest
 * at slow tempos (around 2.5-3 : 1) and flatten towards even eighths as the tempo rises.
 */
const swingRatio = (bpm: number): number => clamp(2.6 - ((bpm - 60) / 70) * 0.5, 2.1, 2.6);

/** Per-limb timing offsets in seconds: the ride pushes ahead, the snare hand lays back. */
const FEEL = { ride: -0.006, hat: 0, slap: 0.012, kick: 0.004, brush: -0.01 };

/**
 * A brushes trio drummer, played beat by beat rather than from a 16th-note grid, so the
 * swung notes fall where a player puts them:
 * - ride "ding, DING-a, ding, DING-a", accented on 2 and 4, with the skip note at the
 *   tempo's swing ratio, and now and then an extra skip or a triplet
 * - the left hand sweeping a circle on the snare through every beat, alternating direction
 * - brush pats on 2 and 4, laid back; the hi-hat foot crisp on 2 and 4
 * - a feathered kick on all four beats, barely heard, with an occasional accented "bomb"
 * - sparse snare comping on swung offbeats and triplet fills at phrase ends
 */
export function createBrushes(core: Core): Instrument {
  const { ctx } = core;
  const kit: Kit = { ctx, noise: core.noise };
  const input = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 7500, Q: 0.4 });
  const output = new GainNode(ctx, { gain: 1 });
  input.connect(output);
  let sweepDown = false;
  let fillThisBar = false;

  /** A hit with its limb's feel, a few milliseconds of human looseness and a little level variation. */
  function hit(voice: Voice, limb: keyof typeof FEEL, t: number, vel: number, opts?: HitOpts) {
    const at = Math.max(ctx.currentTime, t + FEEL[limb] + rand(-0.004, 0.004));
    playHit(kit, voice, input, at, vel * rand(0.88, 1.08), opts);
  }

  function beat(s: StepInfo, b: number) {
    const tb = s.time;
    const B = s.stepDur * 4;
    const r = swingRatio(s.bpm);
    const skip = tb + (B * r) / (1 + r);
    const busy = noteDensity(s.evolution);
    const backbeat = b === 1 || b === 3;

    // Ride: quarters, accented on 2 and 4, with the skip note after 2 and 4.
    if (fillThisBar && b === 3) {
      // Triplet fill on the snare instead of the last beat's ride.
      for (let k = 0; k < 3; k++) hit('slap', 'slap', tb + (k * B) / 3, 0.35 + 0.15 * k, { tone: 1.05 });
    } else {
      hit('ride', 'ride', tb, backbeat ? 0.85 : 0.65, { decay: 1.5 });
      if (backbeat || chance(0.1 * busy)) hit('ride', 'ride', skip, 0.42, { decay: 0.9 });
      else if (chance(0.05 * busy)) {
        // The occasional triplet "let-ta" on the ride.
        hit('ride', 'ride', tb + B / 3, 0.35, { decay: 0.8 });
        hit('ride', 'ride', tb + (2 * B) / 3, 0.4, { decay: 0.8 });
      }
    }

    // Left hand: one sweep through the whole beat, alternating direction like a circle.
    sweepDown = !sweepDown;
    hit('brush', 'brush', tb, backbeat ? 0.95 : 0.8, { decay: (B * 1.05) / 0.32, down: sweepDown });

    if (backbeat) {
      hit('slap', 'slap', tb, 0.55);
      hit('hat', 'hat', tb, 0.45, { tone: 0.7, decay: 0.8 });
    }

    // Feathered kick: felt more than heard. Sometimes a bomb on the "and" of 4 or on 3.
    hit('kick', 'kick', tb, 0.16, { tone: 0.8, decay: 0.8 });
    if ((b === 2 || b === 3) && chance(0.06 * busy)) hit('kick', 'kick', b === 3 ? skip : tb, 0.55, { tone: 0.8, decay: 1 });

    // Snare comping: a soft "chatter" on a swung offbeat.
    if (!(fillThisBar && b === 3) && chance(0.13 * busy)) hit('slap', 'slap', skip, rand(0.28, 0.45), { tone: 1.1 });
  }

  return {
    output,
    step(s) {
      if (s.stepInBar === 0) fillThisBar = s.bar % 4 === 3 && chance(0.2 + 0.4 * s.evolution);
      if (s.stepInBar % 4 === 0) beat(s, s.stepInBar / 4);
    },
  };
}
