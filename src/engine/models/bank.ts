// The physical models and Faust drum kits, and how each tile plays its own. Loaded by the engine with a dynamic import, so the page can
// draw before the models' WebAssembly has arrived.
import bells from '../faust/gen/bells';
import choir from '../faust/gen/choir';
import flute from '../faust/gen/flute';
import piano from '../faust/gen/piano';
import strings from '../faust/gen/strings';
import walk from '../faust/gen/walk';
import kitAmbient from '../faust/gen/kit_ambient';
import kitDub from '../faust/gen/kit_dub';
import kitLofi from '../faust/gen/kit_lofi';
import kitTechno from '../faust/gen/kit_techno';
import kitTriphop from '../faust/gen/kit_triphop';
import bass808 from '../faust/gen/bass_808';
import bassMuted from '../faust/gen/bass_muted';
import type { Voice } from '../drums/voices';
import { createKit } from '../faust/kit';
import { compile, FaustNode, loadProcessor, VoicePool } from '../faust/node';
import type { FaustModel } from '../faust/types';
import { clamp } from '../random';
import { midiToFreq } from '../theory';
import type { KitName, ModelHost, ModelName, ModelVoice } from './host';

const MODELS: Record<ModelName, FaustModel> = { flute, strings, choir, piano, bells, walk, muted: bassMuted, b808: bass808 };

/** The genres that play on Faust kits: the model, its voices in slot order, and a trim. */
const KITS: Record<KitName, { model: FaustModel; slots: Voice[]; trim: number }> = {
  lofi: { model: kitLofi, slots: ['kick', 'snare', 'hat'], trim: 2.24 },
  techno: { model: kitTechno, slots: ['kick', 'clap', 'openhat', 'hat', 'rim'], trim: 2.37 },
  dub: { model: kitDub, slots: ['kick', 'rim', 'hat', 'tom'], trim: 2.11 },
  ambient: { model: kitAmbient, slots: ['kick', 'shaker', 'tom'], trim: 2.14 },
  triphop: { model: kitTriphop, slots: ['kick', 'snare', 'hat', 'rim'], trim: 1.64 },
};

/**
 * Output trims. They were set so each model plays as loud as the synth voice it replaced (integrated loudness of
 * long solo renders), keeping the tiles' calibrated levels in tiles.ts valid; the flute and choir then came down a
 * little, as they were asked to be softer. The kits' trims (KITS) were matched the same way.
 */
const TRIM: Record<ModelName, number> = {
  flute: 0.29,
  strings: 0.32,
  choir: 1.5,
  piano: 0.46,
  bells: 0.37,
  walk: 1.95,
  muted: 9.1,
  b808: 4.3,
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
        // "len" is the hold, for a model that shapes its decay by it (the 808); the others have no such control.
        fx.hold(v.voice, t, until, { freq: midiToFreq(midi), vel: clamp(vel, 0, 1), len: hold, ...extra(midi) }, v.legato);
      },
    },
  };
}

/** Faust's vowel index for the choir's vowels; "ah" would pass through "i" and "e" on its way, so it is a dark "o". */
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
  bells: (ctx, c) => struck(ctx, 'bells', c, 4, () => 4.2),
  // Each note is plucked afresh; the finger on the string damps the last one.
  walk: (ctx, c) => held(ctx, 'walk', c, 2, 0.15, false).voice,
  muted: (ctx, c) => held(ctx, 'muted', c, 2, 0.1, false).voice,
  b808: (ctx, c) => {
    // One boom at a time: each new note chokes the one before, which otherwise rings past it.
    const { voice, fx } = held(ctx, 'b808', c, 2, 0.05, false);
    let last: { voice: number; until: number } | null = null;
    let turn = 0;
    return {
      output: voice.output,
      note(t, midi, hold, vel) {
        if (last && last.until > t) {
          const gate = fx.param(`gate${last.voice}`);
          gate.cancelScheduledValues(t - 0.01);
          gate.setValueAtTime(0, t - 0.005);
        }
        const v = turn++ % 2;
        const until = t + Math.max(hold, 0.05);
        fx.hold(v, t, until, { freq: midiToFreq(midi), vel: clamp(vel, 0, 1), len: hold }, false);
        last = { voice: v, until };
      },
    };
  },
};

/** Loads the worklet and compiles every model, so tiles can create their voices synchronously afterwards. */
export async function createModelHost(ctx: BaseAudioContext): Promise<ModelHost> {
  const names = Object.keys(MODELS) as ModelName[];
  const kits = Object.keys(KITS) as KitName[];
  const [, ...compiled] = await Promise.all([
    loadProcessor(ctx),
    ...names.map((n) => compile(MODELS[n])),
    ...kits.map((k) => compile(KITS[k].model)),
  ]);
  const byName = Object.fromEntries(names.map((n, i) => [n, compiled[i]])) as Record<ModelName, Compiled>;
  const kitsByName = Object.fromEntries(kits.map((k, i) => [k, compiled[names.length + i]])) as Record<KitName, Compiled>;
  return {
    create: (name) => MAKERS[name](ctx, byName[name]),
    createKit: (name, main, echo) => createKit(ctx, kitsByName[name], KITS[name].slots, KITS[name].trim, main, echo),
  };
}
