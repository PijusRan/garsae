// Drum genres. Each genre is its own tile with its own volume, and several can layer.
import { drumMutationChance, drumMutationInterval, drumMutationSize, noteDensity } from '../evolution';
import { glide } from '../params';
import { chance, clamp, rand } from '../random';
import type { Core, Instrument, StepInfo } from '../types';
import { makeTracks, mutateOnce, parsePattern, type Track, type TrackDef } from './patterns';
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

/** A drum bus: cleaned-up lows, a fast gentle compressor for punch, soft saturation for glue, a roll-off on top. */
function drumBus(
  ctx: BaseAudioContext,
  o: { highpass: number; lowpass: number; drive: number; threshold: number; ratio: number; release: number; gain: number },
): Chain {
  const input = new BiquadFilterNode(ctx, { type: 'highpass', frequency: o.highpass });
  const comp = new DynamicsCompressorNode(ctx, { threshold: o.threshold, knee: 8, ratio: o.ratio, attack: 0.004, release: o.release });
  const sat = new WaveShaperNode(ctx, { curve: saturationCurve(o.drive), oversample: '2x' });
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: o.lowpass, Q: 0.4 });
  const output = new GainNode(ctx, { gain: o.gain });
  input.connect(comp).connect(sat).connect(lp).connect(output);
  return { input, output };
}

const GENRES: Record<'lofi' | 'techno' | 'dub' | 'ambient' | 'house' | 'triphop' | 'dnb' | 'bossa', GenreDef> = {
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
      const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 7500, Q: 0.4 });
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
      const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 15000 });
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
      const input = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 11000 });
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
      const input = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 3200, Q: 0.5 });
      const output = new GainNode(ctx, { gain: 1.3 });
      input.connect(output);
      return { input, output };
    },
  },

  // Deep house: a rounder kick than techno, a clap laid on top of a soft shuffle.
  house: {
    swing: 0.13,
    humanize: 0.003,
    tracks: [
      { voice: 'kick', pattern: 'X...X...X...X...', core: true, opts: { tone: 0.92, decay: 1.05 } },
      { voice: 'clap', pattern: '....x.......x...', core: true, gain: 0.5, opts: { decay: 1.3 } },
      { voice: 'openhat', pattern: '..o...o...o...o.', gain: 0.75, opts: { decay: 0.8 } },
      { voice: 'shaker', pattern: 'g.ogg.ogg.ogg.og', gain: 0.8 },
      { voice: 'rim', pattern: '...g.....g....g.', gain: 0.4 },
    ],
    fills: [{ voice: 'shaker', pattern: 'o.oo' }],
    chain: (ctx) => drumBus(ctx, { highpass: 32, lowpass: 13000, drive: 1.3, threshold: -18, ratio: 3, release: 0.12, gain: 0.85 }),
  },

  // Trip hop: a slow, heavy break with a big dark snare, sat low in a dusty room.
  triphop: {
    swing: 0.17,
    humanize: 0.008,
    tracks: [
      { voice: 'kick', pattern: 'X.....x...X.....', core: true, opts: { tone: 0.82, decay: 1.35 } },
      { voice: 'snare', pattern: '....X.......X...', core: true, echo: true, opts: { tone: 0.84, decay: 1.5 } },
      { voice: 'hat', pattern: 'o.x.o.x.o.x.o.x.', gain: 0.6, opts: { tone: 0.88, decay: 1.2 } },
      { voice: 'rim', pattern: '...........g...g', gain: 0.5, opts: { tone: 0.8 } },
      { voice: 'kick', pattern: '.............g..', gain: 0.6, opts: { tone: 0.82, decay: 0.8 } },
    ],
    fills: [{ voice: 'snare', pattern: '..go', opts: { tone: 0.84, decay: 0.9 } }],
    chain(ctx) {
      const bus = drumBus(ctx, { highpass: 38, lowpass: 8500, drive: 1.7, threshold: -20, ratio: 4, release: 0.14, gain: 0.8 });
      // A short, dark slap on the snare: the sound of a small room.
      const echo = new GainNode(ctx, { gain: 0.5 });
      const delay = new DelayNode(ctx, { maxDelayTime: 1, delayTime: 0.09 });
      const dark = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1800 });
      const feedback = new GainNode(ctx, { gain: 0.3 });
      echo.connect(delay).connect(dark).connect(feedback).connect(delay);
      dark.connect(bus.output);
      return { ...bus, echo };
    },
  },

  // Liquid drum and bass: the two-step played at double time over the slow tempo, light and rolling, on a tight bus.
  dnb: {
    swing: 0.03,
    humanize: 0.002,
    tracks: [
      { voice: 'kick', pattern: 'X....x..X....x..', core: true, opts: { tone: 1.05, decay: 0.6 } },
      { voice: 'snare', pattern: '..X...X...X...X.', core: true, gain: 0.8, opts: { tone: 1.15, decay: 0.75 } },
      { voice: 'hat', pattern: 'x.o.x.o.x.o.x.o.', gain: 0.75, opts: { tone: 1.05, decay: 0.7 } },
      { voice: 'shaker', pattern: '.g.g.g.g.g.g.g.g', gain: 0.8 },
      { voice: 'snare', pattern: '.....g.......g..', gain: 0.45, opts: { tone: 1.2, decay: 0.5 } },
      { voice: 'openhat', pattern: '...............o', gain: 0.5, opts: { decay: 0.5 } },
    ],
    fills: [{ voice: 'snare', pattern: '.ogo', opts: { tone: 1.15, decay: 0.6 } }],
    chain: (ctx) => drumBus(ctx, { highpass: 45, lowpass: 11000, drive: 1.4, threshold: -20, ratio: 4, release: 0.07, gain: 0.8 }),
  },

  // Bossa nova: the cross-stick clave over a quiet surdo pulse and a steady shaker. Almost straight, never pushed.
  bossa: {
    swing: 0.03,
    humanize: 0.006,
    tracks: [
      { voice: 'kick', pattern: 'x..g....x..g....', core: true, gain: 0.75, opts: { tone: 0.8, decay: 1.1 } },
      { voice: 'rim', pattern: 'x..x..x...x..x..', core: true, gain: 0.7, opts: { tone: 0.82, decay: 1.5 } },
      { voice: 'shaker', pattern: 'o.g.o.g.o.g.o.g.', gain: 0.8, opts: { decay: 1.2 } },
      { voice: 'hat', pattern: '....g.......g...', gain: 0.5, opts: { tone: 0.8 } },
    ],
    fills: [{ voice: 'rim', pattern: '.gog', opts: { tone: 0.82 } }],
    chain: (ctx) => drumBus(ctx, { highpass: 40, lowpass: 11000, drive: 1.2, threshold: -24, ratio: 2, release: 0.15, gain: 0.95 }),
  },
};

/**
 * Where each voice sits across the kit, as a drummer's kit is heard from the room. Kick, snare and clap stay centred:
 * they carry the weight, and the master keeps the lows mono anyway.
 */
const KIT_PAN: Partial<Record<Voice, number>> = { hat: 0.16, openhat: 0.22, shaker: -0.22, rim: -0.12, tom: -0.14 };

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
    const placed = new Map<Voice, AudioNode>();
    /** The input a voice plays into: through a panner of its own if it has a place in the kit. */
    const placeOf = (voice: Voice): AudioNode => {
      const pan = KIT_PAN[voice];
      if (pan === undefined) return chain.input;
      let node = placed.get(voice);
      if (!node) {
        node = new StereoPannerNode(ctx, { pan });
        node.connect(chain.input);
        placed.set(voice, node);
      }
      return node;
    };
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
          playHit(kit, tr.def.voice, placeOf(tr.def.voice), at, v, tr.def.opts);
          if (tr.def.echo && chain.echo) playHit(kit, tr.def.voice, chain.echo, at, v, tr.def.opts);
        }
        if (fillThisBar && s.stepInBar >= 12) {
          for (const f of fills) {
            const vel = f.steps[s.stepInBar - 12];
            if (vel > 0) playHit(kit, f.voice, placeOf(f.voice), t, vel * 0.8, f.opts);
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
export const createHouse = createPatternGenre(GENRES.house);
export const createTripHop = createPatternGenre(GENRES.triphop);
export const createDnb = createPatternGenre(GENRES.dnb);
export const createBossa = createPatternGenre(GENRES.bossa);

// ---------------------------------------------------------------- breakbeat

/**
 * The Amen break: G. C. Coleman's four bars from The Winstons' "Amen, Brother" (1969), the most sampled drum break
 * there is. Played as recorded, on the 64-step grid: two bars of the groove with its doubled kick and snare pickups,
 * a third that delays the last snare, and a fourth that drops the downbeat and hits the crash early.
 * Eighths on the ride throughout, broken only by that crash. It never mutates: the point is that you know it.
 */
const AMEN: TrackDef[] = [
  { voice: 'kick', pattern: 'X.X.......xX....' + 'X.X.......xX....' + 'X.X.......X.....' + '..xX......X.....', opts: { tone: 1.1, decay: 0.6 } },
  { voice: 'snare', pattern: '....X..o.o..X..o' + '....X..o.o..X..o' + '....X..o.o....X.' + '.o..X..o.o....X.', opts: { tone: 1.12, decay: 0.8 } },
  { voice: 'ride', pattern: 'x.o.x.o.x.o.x.o.' + 'x.o.x.o.x.o.x.o.' + 'x.o.x.o.x.o.x.o.' + 'x.o.x.o.x...x.o.', gain: 3, opts: { decay: 0.9 } },
  { voice: 'openhat', pattern: '................' + '................' + '................' + '..........X.....', gain: 0.9, opts: { tone: 0.82, decay: 3 } },
];

export function createBreakbeat(core: Core): Instrument {
  const { ctx } = core;
  const kit: Kit = { ctx, noise: core.noise };
  const tracks = makeTracks(AMEN);
  // Drum-bus glue: a fast compressor for punch, then soft saturation. Bright, not darkened.
  const input = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 45 });
  const comp = new DynamicsCompressorNode(ctx, { threshold: -20, knee: 6, ratio: 4, attack: 0.002, release: 0.07 });
  const makeUp = new GainNode(ctx, { gain: 1.6 });
  const sat = new WaveShaperNode(ctx, { curve: saturationCurve(1.6), oversample: '4x' });
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 12000, Q: 0.4 });
  const output = new GainNode(ctx, { gain: 0.75 });
  input.connect(comp).connect(makeUp).connect(sat).connect(lp).connect(output);

  return {
    output,
    step(s) {
      const pos = (s.bar % 4) * 16 + s.stepInBar;
      const t = s.time + swingOffset(s.stepInBar, s.stepDur, 0.02);
      for (const tr of tracks) {
        const vel = tr.base[pos];
        if (vel <= 0) continue;
        playHit(kit, tr.def.voice, input, Math.max(s.time, t + rand(-0.001, 0.001)), vel * (tr.def.gain ?? 1), tr.def.opts);
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
  const input = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 12000, Q: 0.4 });
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
