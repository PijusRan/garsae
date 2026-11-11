// Drum genres. Each genre is its own tile with its own volume, and several can layer.
import { drumMutationChance, drumMutationInterval, drumMutationSize } from '../evolution';
import { glide } from '../params';
import { chance, pick, rand } from '../random';
import type { Core, Instrument, StepInfo } from '../types';
import { makeTracks, mutateOnce, parsePattern, type Track, type TrackDef } from './patterns';
import { saturationCurve } from '../synth';
import { playHit, type Kit, type Voice } from './voices';
import { alternatesOf, compareGains, modelKit, type DrumKit, type KitName } from '../models/host';
import type { TileId } from '../../tiles';

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
  /** The genre plays on this Faust kit (faust/dsp/kit_*.dsp) instead of the synth kit. */
  faust?: KitName;
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

const GENRES: Record<'lofi' | 'techno' | 'dub' | 'ambient' | 'hands' | 'house' | 'triphop' | 'dnb' | 'bossa', GenreDef> = {
  // Lo-fi hip hop: lazy boom-bap, heavy swing, dusty and darkened.
  lofi: {
    faust: 'lofi',
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
    faust: 'techno',
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
    faust: 'dub',
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
    faust: 'ambient',
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

  // Hand drums: a calm conga tumbao. Heel and toe murmur through the bar, a slap on 2, two open tones on 4 and its "and"
  // (the second on the low tumba), a high quinto that wanders, a frame drum underneath and a soft shaker.
  hands: {
    swing: 0.1,
    humanize: 0.007,
    tracks: [
      { voice: 'congaslap', pattern: '....x...........', core: true, gain: 0.8 },
      { voice: 'conga', pattern: '............X...', core: true, gain: 0.85 },
      { voice: 'conga', pattern: '..............x.', core: true, gain: 0.85, opts: { tone: 0.78, decay: 1.25 } },
      { voice: 'conga', pattern: 'g.g...g.g.g.....', gain: 0.6, opts: { decay: 0.3 } },
      { voice: 'conga', pattern: '.......g.....g..', gain: 0.6, opts: { tone: 1.32, decay: 0.8 } },
      { voice: 'tom', pattern: 'x.......o.......', gain: 0.3, opts: { tone: 0.55, decay: 1.2 } },
      { voice: 'shaker', pattern: 'o.g.o.g.o.g.o.g.', gain: 0.9, opts: { decay: 1.3 } },
    ],
    fills: [{ voice: 'conga', pattern: '.ooX', opts: { tone: 1.32, decay: 0.8 } }],
    chain: (ctx) => drumBus(ctx, { highpass: 40, lowpass: 9000, drive: 1.15, threshold: -24, ratio: 2, release: 0.15, gain: 1 }),
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
    faust: 'triphop',
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
const KIT_PAN: Partial<Record<Voice, number>> = { hat: 0.16, openhat: 0.22, shaker: -0.22, rim: -0.12, tom: -0.14, conga: 0.14, congaslap: 0.14 };

function swingOffset(stepInBar: number, stepDur: number, swing: number): number {
  return stepInBar % 2 === 1 ? swing * stepDur : 0;
}

/**
 * The synth kit: each hit built from Web Audio nodes (voices.ts), hats, shakers, rims and toms a little off centre
 * (KIT_PAN), echo tracks sent to `echo` as well.
 */
export function synthKit(core: Core, main: AudioNode, echo: AudioNode | null): DrumKit {
  const { ctx } = core;
  const kit: Kit = { ctx, noise: core.noise };
  const placed = new Map<Voice, AudioNode>();
  const placeOf = (voice: Voice): AudioNode => {
    const pan = KIT_PAN[voice];
    if (pan === undefined) return main;
    let node = placed.get(voice);
    if (!node) {
      node = new StereoPannerNode(ctx, { pan });
      node.connect(main);
      placed.set(voice, node);
    }
    return node;
  };
  return {
    hit(voice, t, vel, opts, toEcho) {
      playHit(kit, voice, placeOf(voice), t, vel, opts);
      if (toEcho && echo) playHit(kit, voice, echo, t, vel, opts);
    },
  };
}

/**
 * The kit a genre plays its hits on: its own (a Faust kit for the genres that have one, otherwise the synth kit), or
 * in listening tests, its own and each alternate kit (models/host.ts) side by side on the same hits, only the chosen
 * one heard.
 */
function genreKit(core: Core, id: TileId, own: (main: AudioNode, echo: AudioNode | null) => DrumKit, input: AudioNode, echo: AudioNode | null): DrumKit {
  const alts = alternatesOf(core, id, 'hits');
  if (!alts.length) return own(input, echo);
  const main = compareGains(core, alts.length + 1, input);
  const sends = echo ? compareGains(core, alts.length + 1, echo) : null;
  const all = [own(main[0], sends?.[0] ?? null), ...alts.map((a, i) => a.create(core, main[i + 1], sends?.[i + 1] ?? null))];
  return { hit: (...args) => all.forEach((k) => k.hit(...args)) };
}

function createPatternGenre(id: TileId, def: GenreDef) {
  return (core: Core): Instrument => {
    const chain = def.chain(core.ctx);
    const faust = def.faust;
    const kit = genreKit(
      core,
      id,
      (main, echo) => (faust ? modelKit(core, faust, main, echo) : synthKit(core, main, echo)),
      chain.input,
      chain.echo ?? null,
    );
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
          kit.hit(tr.def.voice, at, vel * (tr.def.gain ?? 1) * rand(0.92, 1.05), tr.def.opts, tr.def.echo);
        }
        if (fillThisBar && s.stepInBar >= 12) {
          for (const f of fills) {
            const vel = f.steps[s.stepInBar - 12];
            if (vel > 0) kit.hit(f.voice, t, vel * 0.8, f.opts);
          }
        }
      },
    };
  };
}

export const createLofi = createPatternGenre('lofi', GENRES.lofi);
export const createTechno = createPatternGenre('techno', GENRES.techno);
export const createDub = createPatternGenre('dub', GENRES.dub);
export const createAmbientPulse = createPatternGenre('ambient', GENRES.ambient);
export const createHandDrums = createPatternGenre('hands', GENRES.hands);
export const createHouse = createPatternGenre('house', GENRES.house);
export const createTripHop = createPatternGenre('triphop', GENRES.triphop);
export const createDnb = createPatternGenre('dnb', GENRES.dnb);
export const createBossa = createPatternGenre('bossa', GENRES.bossa);

// ---------------------------------------------------------------- breakbeat

interface Break {
  name: string;
  /** Tracks on the break's own 16th grid, 16 steps a bar. */
  tracks: TrackDef[];
}

/** How a breakbeat producer plays the drums: crisp and short, so the break reads at speed. */
const TIGHT = {
  kick: { tone: 1.1, decay: 0.5 },
  snare: { tone: 1.15, decay: 0.6 },
  hat: { tone: 1.1, decay: 0.55 },
  openhat: { tone: 1.05, decay: 0.8 },
};

const BREAKS: Break[] = [
  {
    // The Amen break: G. C. Coleman's four bars from The Winstons' "Amen, Brother" (1969), the most sampled drum break
    // there is. Two bars of the groove with its doubled kick and snare pickups, a third that delays the last snare, and
    // a fourth that drops the downbeat and hits the crash early. Eighths on the ride throughout, broken by the crash.
    name: 'amen',
    tracks: [
      { voice: 'kick', pattern: 'X.X.......xX....' + 'X.X.......xX....' + 'X.X.......X.....' + '..xX......X.....', opts: TIGHT.kick },
      { voice: 'snare', pattern: '....X..o.o..X..o' + '....X..o.o..X..o' + '....X..o.o....X.' + '.o..X..o.o....X.', opts: TIGHT.snare },
      { voice: 'ride', pattern: 'x.o.x.o.x.o.x.o.' + 'x.o.x.o.x.o.x.o.' + 'x.o.x.o.x.o.x.o.' + 'x.o.x.o.x...x.o.', gain: 3, opts: { decay: 0.7 } },
      { voice: 'openhat', pattern: '................' + '................' + '................' + '..........X.....', gain: 0.9, opts: { tone: 0.82, decay: 2.2 } },
    ],
  },
  {
    // A two-step break, the backbone of breaks and big beat: the kick on 1 and the "and" of 3, the snare on 2 and 4.
    name: 'two-step',
    tracks: [
      { voice: 'kick', pattern: 'X.........X.....' + 'X.....x...X.....', opts: TIGHT.kick },
      { voice: 'snare', pattern: '....X.......X...' + '....X..g....X..g', opts: TIGHT.snare },
      { voice: 'hat', pattern: 'x.o.x.o.x.o.x.o.' + 'x.o.x.o.x.o.x...', opts: TIGHT.hat },
      { voice: 'openhat', pattern: '................' + '..............o.', opts: TIGHT.openhat },
    ],
  },
  {
    // A funk break of the kind breaks producers dig for: a syncopated kick, ghost notes all round the backbeat, and
    // sixteenths on the hat.
    name: 'funk',
    tracks: [
      { voice: 'kick', pattern: 'X.X.......X..x..' + 'X.....X.X.....x.', opts: TIGHT.kick },
      { voice: 'snare', pattern: '....X..g.g..X..g' + '.g..X..g.g..X...', opts: TIGHT.snare },
      { voice: 'hat', pattern: 'xgxgxgxgxgxgxgxg' + 'xgxgxgxgxgxgxgxg', gain: 0.9, opts: TIGHT.hat },
    ],
  },
  {
    // A big beat: straight and heavy, the kick pushing on the "and" of 2 and 3, an open hat closing each bar.
    name: 'big beat',
    tracks: [
      { voice: 'kick', pattern: 'X.....X...X.....' + 'X.....X...X..X..', opts: TIGHT.kick },
      { voice: 'snare', pattern: '....X.......X...' + '....X.......X.x.', opts: TIGHT.snare },
      { voice: 'hat', pattern: 'x.x.x.x.x.x.x...' + 'x.x.x.x.x.x.x...', opts: TIGHT.hat },
      { voice: 'openhat', pattern: '..............o.' + '..............o.', opts: TIGHT.openhat },
    ],
  },
];

/** Steps in a phrase: four bars of the break. Shorter breaks repeat within it, and breaks change only between. */
const PHRASE = 64;

type Ending = 'roll' | 'stutter' | 'drop';

/**
 * Breakbeat as electronic music plays it: fast and tight. At calm tempos (up to 90 bpm) the break runs at double
 * time, 120-180 bpm, where breaks live. Near-quantized (no swing, half a millisecond of looseness), short punchy drums,
 * a hard, fast bus compressor and saturation, left bright. It plays the Amen and three other standard breaks, may
 * change break every four bars (more often with Evolution), and may end a phrase with a snare roll, a stutter (the
 * beat before, again) or a drop to near silence before the downbeat.
 */
export function createBreakbeat(core: Core): Instrument {
  const { ctx } = core;
  const input = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 45 });
  const comp = new DynamicsCompressorNode(ctx, { threshold: -22, knee: 4, ratio: 5, attack: 0.001, release: 0.05 });
  const makeUp = new GainNode(ctx, { gain: 1.8 });
  const sat = new WaveShaperNode(ctx, { curve: saturationCurve(1.6), oversample: '4x' });
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 14000, Q: 0.4 });
  const output = new GainNode(ctx, { gain: 0.75 });
  input.connect(comp).connect(makeUp).connect(sat).connect(lp).connect(output);
  const kit = genreKit(core, 'breaks', (main, echo) => synthKit(core, main, echo), input, null);
  let brk = BREAKS[0];
  let tracks = makeTracks(brk.tracks);
  let ending: Ending | null = null;

  function newPhrase(evolution: number) {
    if (chance(0.2 + 0.5 * evolution)) {
      brk = pick(BREAKS.filter((b) => b !== brk));
      tracks = makeTracks(brk.tracks);
    }
    ending = chance(0.15 + 0.45 * evolution) ? pick<Ending>(['roll', 'stutter', 'drop']) : null;
  }

  function play(pos: number, t: number) {
    // The phrase's last beat may be an ending instead of the break.
    let from = pos;
    if (ending && pos >= PHRASE - 4) {
      const i = pos - (PHRASE - 4);
      if (ending === 'roll') {
        kit.hit('snare', t, 0.45 + 0.17 * i, TIGHT.snare);
        if (i === 0) kit.hit('kick', t, 0.9, TIGHT.kick);
        return;
      }
      if (ending === 'drop') {
        if (i === 0) kit.hit('kick', t, 0.8, TIGHT.kick);
        return;
      }
      from = pos - 4;
    }
    for (const tr of tracks) {
      const vel = tr.base[from % tr.base.length];
      if (vel > 0) kit.hit(tr.def.voice, Math.max(ctx.currentTime, t + rand(-0.0005, 0.0005)), vel * (tr.def.gain ?? 1), tr.def.opts);
    }
  }

  return {
    output,
    step(s) {
      // Two of the break's sixteenths in each of ours at calm tempos.
      const per = s.bpm <= 90 ? 2 : 1;
      for (let k = 0; k < per; k++) {
        const pos = (s.step * per + k) % PHRASE;
        if (pos === 0) newPhrase(s.evolution);
        play(pos, s.time + (k * s.stepDur) / per);
      }
    },
  };
}
