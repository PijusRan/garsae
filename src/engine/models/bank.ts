// The physical-model voices. Loaded on demand (a dynamic import from the engine), so the models' WebAssembly
// never reaches the app unless they are switched on.
import arp from '../faust/gen/arp';
import bells from '../faust/gen/bells';
import choir from '../faust/gen/choir';
import congas from '../faust/gen/congas';
import flute from '../faust/gen/flute';
import piano from '../faust/gen/piano';
import strings from '../faust/gen/strings';
import vibes from '../faust/gen/vibes';
import walk from '../faust/gen/walk';
import { compile, FaustNode, loadProcessor, VoicePool } from '../faust/node';
import type { FaustModel } from '../faust/types';
import { clamp } from '../random';
import { midiToFreq } from '../theory';
import type { ModelHost, ModelName, ModelVoice, Stroke, VoiceMode } from './host';

const MODELS: Record<ModelName, FaustModel> = { flute, strings, choir, piano, vibes, arp, bells, walk, congas };

/**
 * Output trims, so a model plays as loud as the synth voice it stands in for (matched by integrated loudness on
 * solo renders; see the models section of the smoke test). A/B comparisons are only fair at equal loudness.
 */
const TRIM: Record<ModelName, number> = {
  flute: 0.38,
  strings: 0.32,
  choir: 1.64,
  piano: 0.4,
  vibes: 0.41,
  arp: 0.25,
  bells: 0.37,
  walk: 3.15,
  congas: 1.04,
};

type Compiled = Awaited<ReturnType<typeof compile>>;

function start(ctx: BaseAudioContext, name: ModelName, c: Compiled): { fx: FaustNode; output: GainNode } {
  const fx = new FaustNode(ctx, c);
  const output = new GainNode(ctx, { gain: TRIM[name] });
  fx.node.connect(output);
  return { fx, output };
}

/** A struck model (bars, mallets): the gate's edge is the hit, and the voice rings for `ring(midi)` seconds. */
function struck(ctx: BaseAudioContext, name: ModelName, c: Compiled, size: number, ring: (midi: number) => number): ModelVoice {
  const { fx, output } = start(ctx, name, c);
  const pool = new VoicePool(size);
  return {
    output,
    note(t, midi, _hold, vel) {
      const { voice } = pool.take(t, midi, t, ring(midi));
      fx.strike(voice, t, { freq: midiToFreq(midi), vel: clamp(vel, 0, 1) });
    },
  };
}

/** A held model (blown, bowed, sung, a damped string): it sounds while the gate is open, then releases for `tail`. */
function held(
  ctx: BaseAudioContext,
  name: ModelName,
  c: Compiled,
  size: number,
  tail: number,
  legato: boolean,
  extra: (midi: number) => Record<string, number> = () => ({}),
): { voice: ModelVoice; fx: FaustNode } {
  const { fx, output } = start(ctx, name, c);
  const pool = new VoicePool(size);
  return {
    fx,
    voice: {
      output,
      note(t, midi, hold, vel) {
        const until = t + Math.max(hold, 0.05);
        const v = pool.take(t, midi, until, tail, legato);
        fx.hold(v.voice, t, until, { freq: midiToFreq(midi), vel: clamp(vel, 0, 1), ...extra(midi) }, v.legato);
      },
    },
  };
}

const STROKES: Record<Stroke, number> = { open: 0, slap: 1, mute: 2 };

/** Faust's vowel index for the synth choir's vowels; "ah" would pass through "i" and "e", so it stays a dark "o". */
const VOWELS = { oo: 4, oh: 3, ah: 3.2 };

const MAKERS: Record<ModelName, (ctx: BaseAudioContext, c: Compiled) => ModelVoice> = {
  flute: (ctx, c) => held(ctx, 'flute', c, 2, 0.4, false).voice,
  // Bowed sections move to the next chord legato: the bow keeps going, the fingers change.
  strings: (ctx, c) => held(ctx, 'strings', c, 6, 1.2, true).voice,
  choir: (ctx, c) => {
    // A tenor under the alto, sopranos on top.
    const type = (midi: number) => ({ type: midi < 55 ? 4 : midi < 66 ? 0 : 3 });
    const { voice, fx } = held(ctx, 'choir', c, 5, 2.5, true, type);
    let now: number = VOWELS.oo;
    voice.setVowel = (vowel, t) => {
      // In twenty small steps over two seconds: the model works the formants out afresh at each step, not every sample.
      const from = now;
      now = VOWELS[vowel];
      for (let k = 1; k <= 20; k++) fx.param('vowel').setValueAtTime(from + ((now - from) * k) / 20, t + k * 0.1);
    };
    return voice;
  },
  piano: (ctx, c) => held(ctx, 'piano', c, 8, 0.6, false).voice,
  vibes: (ctx, c) => struck(ctx, 'vibes', c, 6, (m) => clamp(4.2 * Math.sqrt(262 / midiToFreq(m)), 1.8, 5)),
  arp: (ctx, c) => struck(ctx, 'arp', c, 5, (m) => clamp(1.6 * Math.sqrt(262 / midiToFreq(m)), 0.7, 2.2)),
  bells: (ctx, c) => struck(ctx, 'bells', c, 4, () => 4.2),
  walk: (ctx, c) => held(ctx, 'walk', c, 2, 0.15, false).voice,
  congas: (ctx, c) => {
    const { fx, output } = start(ctx, 'congas', c);
    const pool = new VoicePool(4);
    return {
      output,
      note(t, midi, _hold, vel, stroke = 'open') {
        const { voice } = pool.take(t, midi, t, stroke === 'open' ? 0.5 : 0.15);
        fx.strike(voice, t, { freq: midiToFreq(midi), vel: clamp(vel, 0, 1), stroke: STROKES[stroke] });
      },
    };
  },
};

/** Loads the worklet and compiles every model, so tiles can create their voices synchronously afterwards. */
export async function createModelHost(ctx: BaseAudioContext, mode: Exclude<VoiceMode, 'synth'>, ab: AudioNode): Promise<ModelHost> {
  const names = Object.keys(MODELS) as ModelName[];
  const [, ...compiled] = await Promise.all([loadProcessor(ctx), ...names.map((n) => compile(MODELS[n]))]);
  const byName = Object.fromEntries(names.map((n, i) => [n, compiled[i]])) as Record<ModelName, Compiled>;
  return { mode, ab, create: (name) => MAKERS[name](ctx, byName[name]) };
}
